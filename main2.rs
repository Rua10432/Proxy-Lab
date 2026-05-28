#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Local;
use eframe::egui;
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use winreg::RegKey;
use winreg::enums::*;

// ─── 单次测试结果 ─────────────────────────────────────────────────────────────

#[derive(Clone, serde::Deserialize, serde::Serialize)]
enum PingResult {
    Ok { seq: u32, ms: u128 },
    Err { seq: u32, msg: String },
}

// ─── 统计 ────────────────────────────────────────────────────────────────────
#[derive(PartialEq, Debug, Clone, Copy, serde::Deserialize, serde::Serialize)]
enum Theme {
    Dark,
    Light,
    System,
}

#[derive(Default, Clone, serde::Deserialize, serde::Serialize)]
struct Stats {
    min: Option<u128>,
    max: Option<u128>,
    sum: u128,
    ok: u32,
    fail: u32,
}
//页面
#[derive(PartialEq, Debug, Clone, Copy, serde::Deserialize, serde::Serialize)]
enum Page {
    ProxyTest,
    ProxyConnection,
    Settings,
}

impl Stats {
    fn record(&mut self, r: &PingResult) {
        match r {
            PingResult::Ok { ms, .. } => {
                self.ok += 1;
                self.sum += ms;
                self.min = Some(self.min.map_or(*ms, |m: u128| m.min(*ms)));
                self.max = Some(self.max.map_or(*ms, |m: u128| m.max(*ms)));
            }
            PingResult::Err { .. } => self.fail += 1,
        }
    }
    fn total(&self) -> u32 {
        self.ok + self.fail
    }
    fn avg(&self) -> Option<u128> {
        (self.ok > 0).then(|| self.sum / self.ok as u128)
    }
    fn loss_pct(&self) -> f64 {
        if self.total() == 0 {
            0.0
        } else {
            self.fail as f64 / self.total() as f64 * 100.0
        }
    }
}

fn fmt_ms(v: Option<u128>) -> String {
    v.map_or_else(|| "--".into(), |n| format!("{} ms", n))
}

// ─── 共享状态（UI 线程 ↔ 后台线程） ─────────────────────────────────────────

#[derive(Default, serde::Deserialize, serde::Serialize)]
struct Shared {
    results: Vec<PingResult>,
    done: bool,
    stopped: bool,
    stop_req: bool,
}

// ─── App ──────────────────────────────────────────────────────────────────────
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(default)]
struct ProxyTester {
    test_host: String,
    config_host: String,
    test_port: String,
    config_port: String,
    count: String,
    timeout: String,
    interval: String,
    proto: usize, // 0=TCP, 1=HTTP, 2=SOCKS5
    selected_theme: Theme,
    running: bool,
    stats: Stats,
    log_proxy_test: Vec<String>,
    log_proxy_config: Vec<String>,
    #[serde(skip)]
    shared: Option<Arc<Mutex<Shared>>>,
    current_page: Page,
}

impl Default for ProxyTester {
    fn default() -> Self {
        Self {
            test_host: String::new(),
            test_port: String::new(),
            config_port: String::new(),
            config_host: String::new(),
            count: "10".into(),
            timeout: "3000".into(),
            interval: "500".into(),
            proto: 0,
            running: false,
            stats: Stats::default(),
            log_proxy_test: Vec::new(),
            log_proxy_config: Vec::new(),
            shared: None,
            current_page: Page::ProxyTest,
            selected_theme: Theme::System,
        }
    }
}

const PROTOS: &[&str] = &["HTTP", "SOCKS5"];

impl Theme {
    fn theme_switch(&self) -> &str {
        match self {
            Self::System => "System",
            Self::Dark => "Dark",
            Self::Light => "Light",
        }
    }
}

impl ProxyTester {
    // fn new(cc: &eframe::CreationContext<'_>) -> Self {
    //     // 加载系统中文字体
    //     let mut fonts = egui::FontDefinitions::default();
    //     for path in [
    //         "C:/Windows/Fonts/msyh.ttc",
    //         "C:/Windows/Fonts/simsun.ttc",
    //         "C:/Windows/Fonts/simhei.ttf",
    //     ] {
    //         if let Ok(data) = std::fs::read(path) {
    //             fonts
    //                 .font_data
    //                 .insert("chinese".into(), egui::FontData::from_owned(data));
    //             fonts
    //                 .families
    //                 .get_mut(&egui::FontFamily::Proportional)
    //                 .unwrap()
    //                 .insert(0, "chinese".into());
    //             fonts
    //                 .families
    //                 .get_mut(&egui::FontFamily::Monospace)
    //                 .unwrap()
    //                 .push("chinese".into());
    //             break;
    //         }
    //     }
    //     cc.egui_ctx.set_fonts(fonts);
    //     Self::default()
    // }
    pub fn config_system_porxy(&mut self) {
        let host = self.config_host.trim();
        let port = self.config_port.trim();
        if host.is_empty() {
            self.log_proxy_config
                .push("[Error]Address must be filled".into());
            return;
        }
        if port.is_empty() {
            self.log_proxy_config.push("[Error]Invaild Port".into());
            return;
        }
        let now = Local::now();
        let timestamp = now.format("%:z %Y-%m-%d %H:%M:%S").to_string();
        match set_windows_proxy(host, &port, true) {
            Ok(_) => {
                //let success_msg=format!("[info]system proxy changed-{}:{}",host,port);
                //now.format("%Y-%m-%d %H:%M:%S %:z").to_string()
                self.log_proxy_config.push(
                    format!("{}-[info]system proxy changed-{}:{}", timestamp, host, port).into(),
                );
            }
            Err(e) => {
                self.log_proxy_config
                    .push(format!("{}-[Error]system proxy fail-{}", timestamp, e).into());
            }
        }
    }
    fn start_test(&mut self) {
        let host = self.test_host.trim().to_string();
        if host.is_empty() {
            self.log_proxy_test
                .push("Error: Address must be filled".into());
            return;
        }
        let port: u16 = match self.test_port.trim().parse::<u16>() {
            Ok(p) if p > 0 => p,
            _ => {
                self.log_proxy_test.push("Error: invaild Port".into());
                return;
            }
        };
        let count: u32 = match self.count.trim().parse::<u32>() {
            Ok(c) if (1..=500).contains(&c) => c,
            _ => {
                self.log_proxy_test.push("Error: Invaild times".into());
                return;
            }
        };
        let timeout_ms: u64 = self
            .timeout
            .trim()
            .parse::<u64>()
            .unwrap_or(3000)
            .clamp(200, 30_000);
        let itvl_ms: u64 = self
            .interval
            .trim()
            .parse::<u64>()
            .unwrap_or(500)
            .min(10_000);
        let proto = PROTOS[self.proto].to_string();

        self.stats = Stats::default();
        self.running = true;
        let shared = Arc::new(Mutex::new(Shared::default()));
        self.shared = Some(Arc::clone(&shared));

        self.log_proxy_test.push(String::new());
        self.log_proxy_test
            .push(format!("┌── test  {}:{}  [{}]", host, port, proto));
        self.log_proxy_test.push(format!(
            "times:{}  time out: {} ms  interval: {} ms",
            count, timeout_ms, itvl_ms
        ));
        //self.log_proxy_test.push("│".into());

        thread::spawn(move || {
            for i in 1..=count {
                if shared.lock().unwrap().stop_req {
                    let mut s = shared.lock().unwrap();
                    s.done = true;
                    s.stopped = true;
                    return;
                }
                let addr = format!("{}:{}", host, port);
                let result = tcp_ping(&addr, timeout_ms);
                let entry = match result {
                    Ok(ms) => PingResult::Ok { seq: i, ms },
                    Err(e) => PingResult::Err { seq: i, msg: e },
                };
                shared.lock().unwrap().results.push(entry);

                if i < count {
                    let steps = (itvl_ms / 50).max(1);
                    for _ in 0..steps {
                        if shared.lock().unwrap().stop_req {
                            break;
                        }
                        thread::sleep(Duration::from_millis(50));
                    }
                }
            }
            shared.lock().unwrap().done = true;
        });
    }
}

impl eframe::App for ProxyTester {
    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        //eframe::storage::set_value(storage, eframe::APP_KEY, self);--该api不存在
        //storage.set_string(eframe::APP_KEY, serde_json::to_string(self).unwrap());
        if let Ok(json) = serde_json::to_string(self) {
            storage.set_string(eframe::APP_KEY, json);
        }
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        match self.selected_theme {
            Theme::Dark => ctx.set_visuals(egui::Visuals::dark()),
            Theme::Light => ctx.set_visuals(egui::Visuals::light()),
            Theme::System => ctx.set_visuals(egui::Visuals::default()), // 或者跟随 OS
        }
        egui::TopBottomPanel::top("top_panel").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.selectable_value(&mut self.current_page, Page::ProxyTest, "Test");
                ui.selectable_value(&mut self.current_page, Page::ProxyConnection, "Config");
                ui.selectable_value(&mut self.current_page, Page::Settings, "Setting");
            });
        });
        // 轮询后台
        if self.running {
            if let Some(shared) = &self.shared {
                let new_results: Vec<PingResult> =
                    shared.lock().unwrap().results.drain(..).collect();
                for r in &new_results {
                    self.stats.record(r);
                    match r {
                        PingResult::Ok { seq, ms } => self
                            .log_proxy_test
                            .push(format!("│  [{seq:>4}]   {:>6} ms   ", ms,)),
                        PingResult::Err { seq, msg } => self
                            .log_proxy_test
                            .push(format!("│  [{seq:>4}]   fail {msg}")),
                    }
                }
                let (done, stopped) = {
                    let s = shared.lock().unwrap();
                    (s.done, s.stopped)
                };
                if done {
                    self.running = false;
                    self.shared = None;
                    if stopped {
                        self.log_proxy_test.push("│".into());
                        self.log_proxy_test.push(format!(
                            "└── stopped  │ {} success  │ {} fail",
                            self.stats.ok, self.stats.fail
                        ));
                    } else {
                        self.log_proxy_test.push("│".into());
                        self.log_proxy_test.push(format!(
                            "└── finish  │  min {}  │  max {}  │  ave {}  │  loss {}/{}",
                            fmt_ms(self.stats.min),
                            fmt_ms(self.stats.max),
                            fmt_ms(self.stats.avg()),
                            self.stats.fail,
                            self.stats.total()
                        ));
                    }
                }
            }
            ctx.request_repaint_after(Duration::from_millis(100));
        }

        match self.current_page {
            Page::ProxyTest => {
                egui::TopBottomPanel::top("params").show(ctx, |ui| {
                    ui.add_space(6.0);
                    ui.horizontal(|ui| {
                        ui.label("Address:");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.test_host).desired_width(180.0),
                        );
                        ui.label("Port:");
                        ui.add(egui::TextEdit::singleline(&mut self.test_port).desired_width(65.0));
                        ui.label("Potocol:");
                        egui::ComboBox::from_id_source("proto")
                            .selected_text(PROTOS[self.proto])
                            .show_ui(ui, |ui| {
                                for (i, &name) in PROTOS.iter().enumerate() {
                                    ui.selectable_value(&mut self.proto, i, name);
                                }
                            });
                    });
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        ui.label("Times:");
                        ui.add(egui::TextEdit::singleline(&mut self.count).desired_width(55.0));
                        ui.label("time out (ms):");
                        ui.add(egui::TextEdit::singleline(&mut self.timeout).desired_width(65.0));
                        ui.label("interval (ms):");
                        ui.add(egui::TextEdit::singleline(&mut self.interval).desired_width(65.0));
                    });
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        let enabled = !self.running;
                        if ui.add_enabled(enabled, egui::Button::new("test")).clicked() {
                            self.start_test();
                            
                        }
                        if ui
                            .add_enabled(!enabled, egui::Button::new("stop"))
                            .clicked()
                        {
                            if let Some(shared) = &self.shared {
                                shared.lock().unwrap().stop_req = true;
                            }
                        }
                        if ui.button("clear log").clicked() {
                            self.log_proxy_test.clear();
                            self.stats = Stats::default();
                        }
                        if ui.button("clear").clicked() {
                            self.test_host.clear();
                            self.test_port.clear();
                            self.count.clear();
                            self.interval.clear();
                            self.timeout.clear();
                        }
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let (status, color) = if self.running {
                                ("testing", egui::Color32::from_rgb(255, 200, 50))
                            } else {
                                ("ready", egui::Color32::from_rgb(100, 220, 100))
                            };
                            ui.label(egui::RichText::new(status).color(color));
                        });
                    });
                    ui.add_space(4.0);
                });

                egui::TopBottomPanel::bottom("stats_bar").show(ctx, |ui| {
                    ui.add_space(4.0);
                    ui.label(format!(
                        "min: {}  |  max: {}  |  ave: {}  |  loss: {}/{} ({:.0}%)",
                        fmt_ms(self.stats.min),
                        fmt_ms(self.stats.max),
                        fmt_ms(self.stats.avg()),
                        self.stats.fail,
                        self.stats.total(),
                        self.stats.loss_pct()
                    ));
                    ui.add_space(4.0);
                });
                // ── 日志 ──────────────────────────────────────────────────────────────
                egui::CentralPanel::default().show(ctx, |ui| {
                    egui::ScrollArea::vertical()
                        .auto_shrink([false; 2])
                        .stick_to_bottom(true)
                        .show(ui, |ui| {
                            for line in &self.log_proxy_test {
                                let color = if line.contains('✅') {
                                    egui::Color32::from_rgb(100, 220, 100)
                                } else if line.contains('❌') {
                                    egui::Color32::from_rgb(240, 100, 80)
                                } else if line.starts_with('└') || line.starts_with('┌') {
                                    egui::Color32::from_rgb(130, 180, 255)
                                } else {
                                    egui::Color32::GRAY
                                };
                                ui.label(egui::RichText::new(line).monospace().color(color));
                            }
                        });
                });
            }
            Page::ProxyConnection => {
                egui::CentralPanel::default().show(ctx, |ui| {
                    // 明确声明 ui
                    ui.heading("Proxy Config Page is developing");
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        ui.label("Address:");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.config_host).desired_width(55.0),
                        );
                        ui.label("Port:");
                        ui.add(
                            egui::TextEdit::singleline(&mut self.config_port).desired_width(55.0),
                        );
                        if ui.button("config").clicked()
                        {
                            self.config_system_porxy()
                        }
                        if ui.button("clear").clicked()
                        {
                            self.log_proxy_config.clear();
                        }
                    });
                    ui.vertical(|ui| {
                        // 1. 设置一个类似控制台的深色背景容器
                        egui::Frame::dark_canvas(ui.style())
                            .fill(egui::Color32::from_rgb(0, 0, 0)) // 纯黑背景
                            .inner_margin(5.0)
                            .show(ui, |ui| {
                                // 2. 核心滚动区域：设置 id 防止冲突，关闭自动收缩
                                egui::ScrollArea::vertical()
                                    .id_source("configed_system_proxy_log_area")
                                    .auto_shrink([false; 2])
                                    .stick_to_bottom(true) // 自动跟踪最新日志
                                    .show(ui, |ui| {
                                        // 3. 关键：将行间距设为 0，模仿控制台的紧凑感
                                        ui.spacing_mut().item_spacing.y = 0.0;

                                        for line in &self.log_proxy_config {
                                            let color = if line.contains("[Error]") {
                                                egui::Color32::from_rgb(255, 85, 85) // 红色
                                            } else if line.contains("[INFO]") {
                                                egui::Color32::from_rgb(85, 255, 255) // 青色
                                            } else if line.contains("[SUCCESS]") {
                                                egui::Color32::from_rgb(85, 255, 85) // 绿色
                                            } else {
                                                egui::Color32::from_gray(160) // 默认灰色
                                            };

                                            // 使用单行显示，确保 monospace 字体对齐
                                            let mut text = egui::RichText::new(line)
                                                .monospace() // 必须等宽
                                                .size(13.0) // v2rayN 常用字号
                                                .color(color);                  
                                            ui.label(text);
                                        }
                                    });
                            });
                    });
                });
            }
            Page::Settings => {
                egui::CentralPanel::default().show(ctx, |ui| {
                    ui.heading("Setting Page is developing");
                    ui.add_space(8.0);
                    ui_card(ui, |ui| {
                        ui.set_width(100.0);
                        ui.horizontal(|ui| {
                            ui.label(egui::RichText::new("Theme").size(14.0).weak());
                            ui.add_space(4.0);
                            // let avg = fmt_ms(self.stats.avg());
                            // ui.label(egui::RichText::new(avg).size(20.0).strong());
                            egui::ComboBox::from_id_source("theme_switcher")
                                .selected_text(self.selected_theme.theme_switch())
                                .show_ui(ui, |ui| {
                                    ui.selectable_value(
                                        &mut self.selected_theme,
                                        Theme::System,
                                        "System",
                                    );
                                    ui.selectable_value(
                                        &mut self.selected_theme,
                                        Theme::Dark,
                                        "Dark",
                                    );
                                    ui.selectable_value(
                                        &mut self.selected_theme,
                                        Theme::Light,
                                        "Light",
                                    );
                                });
                            // if theme.response.changed(){
                            //     match self.selected_theme {
                            //         Theme::Dark=>{
                            //             ctx.set_visuals(egui::Visuals::dark());
                            //             ctx.request_repaint();
                            //         }
                            //         Theme::Light=>{
                            //             ctx.set_visuals(egui::Visuals::light());
                            //             ctx.request_repaint();
                            //         }
                            //         Theme::System=>{
                            //             ctx.set_visuals(egui::Visuals::default());
                            //             ctx.request_repaint();
                            //         }
                            //     }
                            // }
                        });
                    });
                });
            } // _ => {}
        }
    }
}
//ctx.set_visuals(egui::Visuals::dark());
// fn ModifyTheme(theme:&str){

// }

fn tcp_ping(addr: &str, timeout_ms: u64) -> Result<u128, String> {
    let sock = addr
        .to_socket_addrs()
        .map_err(|e| format!("DNS analysis fail: {e}"))?
        .next()
        .ok_or_else(|| "Fail to analysis host".to_string())?;
    let start = Instant::now();
    TcpStream::connect_timeout(&sock, Duration::from_millis(timeout_ms)).map_err(|e| {
        if e.kind() == std::io::ErrorKind::TimedOut {
            "connection time out".into()
        } else {
            format!("{e}")
        }
    })?;
    Ok(start.elapsed().as_millis())
}

fn latency_bar(ms: u128) -> &'static str {
    match ms {
        0..=30 => "██████  <30 ms",
        31..=80 => "█████░  <80 ms",
        81..=150 => "████░░  <150 ms",
        151..=300 => "███░░░  <300 ms",
        301..=600 => "██░░░░  <600 ms",
        _ => "█░░░░░  >600 ms",
    }
}

fn ui_card<R>(
    ui: &mut egui::Ui,
    add_contents: impl FnOnce(&mut egui::Ui) -> R,
) -> egui::InnerResponse<R> {
    // 设置卡牌样式：背景色、圆角、边框
    egui::Frame::canvas(ui.style())
        .fill(ui.visuals().window_fill()) // 跟随主题的背景色
        .stroke(egui::Stroke::new(
            1.0,
            ui.visuals().widgets.noninteractive.bg_stroke.color,
        )) // 浅色边框
        .rounding(8.0) // 圆角
        .inner_margin(egui::Margin::same(12.0)) // 内边距
        .show(ui, add_contents)
}

fn set_windows_proxy(proxy_addr: &str, proxy_port: &str, enable: bool) -> std::io::Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let cur_ver = hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        KEY_SET_VALUE,
    )?;

    let enable_value: u32 = if enable { 1 } else { 0 };
    cur_ver.set_value("ProxyEnable", &enable_value)?;

    if enable {
        let full_proxy_addr = format!("{}:{}", proxy_addr, proxy_port);
        cur_ver.set_value("ProxyServer", &full_proxy_addr)?;
        //println!("port changed {proxy_addr}:{proxy_port}");
    }

    Ok(())
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Proxy Test v1.0")
            .with_inner_size([700.0, 560.0])
            .with_min_inner_size([560.0, 420.0]),
        ..Default::default()
    };
    eframe::run_native(
        "proxy-tester",
        options,
        // Box::new(|cc| Ok(Box::new(ProxyTester::new(cc)))),
        //Box::new(|cc| Box::new(ProxyTester::new(cc)) as Box<dyn eframe::App>),--普通构建app
        Box::new(|cc| {
            let app: ProxyTester = cc
                .storage
                .and_then(|s| s.get_string(eframe::APP_KEY))
                .and_then(|json| serde_json::from_str(&json).ok())
                .unwrap_or_default();

            Box::new(app)
        }),
    )
}
