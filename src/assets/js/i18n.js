/* ═══════════════════════════════════════════════════════════════════════════════
   i18n — Multilingual Support (EN / 简中 / 繁中 / 日本語)
   ═══════════════════════════════════════════════════════════════════════════════ */

const LANGUAGES = {
  en: 'English',
  zh_cn: '简体中文',
  zh_tw: '繁體中文',
  ja: '日本語',
};

const LOCALE = {
  en: {
    nav: { test:'Test',scan:'Scan',config:'Config',logs:'Logs',monitor:'Monitor',settings:'Settings' },
    common: { refresh:'Refresh',filter:'Filter...',filterResults:'Filter results...',cancel:'Cancel',add:'Add',delete:'Delete',remove:'Remove',save:'Save',close:'Close',optional:'Optional',host:'Host',port:'Port',protocol:'Protocol',password:'Password',username:'Username',address:'Address',latency:'Latency',action:'Action',status:'Status',process:'Process',pid:'PID',localAddr:'Local Address',remoteAddr:'Remote Address',state:'State',traffic:'Traffic' },
    statusbar: { ram:'RAM:' },
    settings: { language:{label:'Language',desc:'Select display language for the application'},theme:{label:'Theme',desc:'Choose your preferred color scheme'},themeSystem:'System',themeLight:'Light',themeDark:'Dark',primaryColor:{label:'Primary Color',desc:'Customize the application accent color'},titleBar:{label:'Title Bar',desc:'Choose between system native or custom title bar'},titleSystem:'System',titleCustom:'Custom',closeBehavior:{label:'Close Button Behavior',desc:'When enabled, closing shows confirmation before exit'} },
    monitor: { totalConn:'Total Connections',proxyTraffic:'Proxy Traffic',directTraffic:'Direct Traffic',listening:'Listening',processes:'Processes',viaProxy:'Via Proxy',tabConnections:'Connections',tabRules:'Proxy Rules',filterAll:'All',filterProxy:'Proxy',filterDirect:'Direct',filterListen:'Listening',emptyTitle:'No connections to display',emptySub:'Click Refresh to fetch current TCP connections',rulesEmptyTitle:'No proxy rules defined',rulesEmptySub:'Add applications to force them through the proxy',addRule:'Add Application',auto:'Auto',searchPlaceholder:'Filter by process or address...',appPath:'Application Path',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'Enter the full path to the executable you want to force through the proxy.',proxyrules:'Proxy Rules' },
    logs: {levelAll:'All',levelInfo:'Info',levelOk:'OK',levelError:'Error',copyAll:'Copy All',copyVisible:'Copy Visible',autoScroll:'Auto-scroll',newEntries:'{0} new',tooltipCopy:'Copy',tooltipClear:'Clear',  filter:'Filter...',emptyTitle:'No log entries',emptySub:'Run a test or scan to see output here',clear:'Clear',export:'Export' },
    scan: {targetNetwork:'Target Network',portRange:'Port Range',performance:'Performance',statusIdle:'Idle',resultCount:'{0} results',colIp:'IP Address',colPort:'Port',colProtocol:'Protocol',colLatency:'Latency',colApply:'Apply',progressLabel:'Scanned: {0} / {1}',foundLabel:'Found: {0}',statScanned:'Total Scanned',statPortsOpen:'Ports Open',statFoundProxies:'Found Proxies',statAvgLatency:'Avg Latency',statScanSpeed:'Scan Speed',clear:'Clear',  network:'Network',subnet:'Subnet',from:'From',to:'To',synThreads:'SYN Threads',synTimeout:'SYN Timeout',verifyThreads:'Verify Threads',verifyTimeout:'Verify Timeout',start:'Start',stop:'Stop',filter:'Filter results...',emptyTitle:'No proxies found yet',emptySub:'Start a scan to discover active proxies on your network',progress:'Scanned',found:'Found',openPorts:'Open Ports' },
    test: {tabManual:'Manual Probe',tabPool:'Proxy Pool',protocol:'Protocol',clear:'Clear',fetchImport:'Fetch & Import',testAll:'Test All',sync:'Sync',clearPool:'Clear Pool',statMin:'Min',statMax:'Max',statAvg:'Avg',statLoss:'Loss',recentTests:'Recent Tests',statusReady:'Ready',proxyCount:'{0} Proxies',filter:'Filter results...',statusFilter:'Status',statusAll:'All Status',statusOk:'OK',statusError:'Error',statusUntested:'Untested',  address:'Address',timeout:'Timeout',interval:'Interval',times:'Times',start:'Start',stop:'Stop',clearHistory:'Clear History',subscriptionUrl:'Subscription Link / URL',fetch:'Fetch',poolEmpty:'Proxy Pool Empty',poolEmptySub:'Add proxies in the Config page or Scan for new ones',type:'Type',colHost:'Host',colPort:'Port',colType:'Type',colLatency:'Latency',colAction:'Action',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'Optional',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'System Proxy Setup',localProxyDetect:'Local Proxy Detection',refreshLocal:'Refresh',localProxyDesc:'Automatically scan local proxy ports and detect running proxy services. Click on a port or process name to fill in the form above.',localProxyChecking:'Detecting local proxy services...',clearHistory:'Clear History',adminLockTitle:'Administrator Privilege Status',  proxyAddress:'Address',proxyPort:'Port',proxyProtocol:'Protocol',proxyUsername:'Username',proxyPassword:'Password',apply:'Apply System Proxy',disconnect:'Disconnect',test_connectivity:'Test Connection',testing:'Testing...',test_success:'Connected in {0}ms',test_failed:'Connection failed',test_before_apply:'Test connection first to enable Apply',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'Optional',recentConfigs:'Recent Configurations',empty:'No saved configurations' },
  },
  zh_cn: {
    nav: { test:'测速',scan:'扫描',config:'配置',logs:'日志',monitor:'监控',settings:'设置' },
    common: { refresh:'刷新',filter:'筛选...',filterResults:'筛选结果...',cancel:'取消',add:'添加',delete:'删除',remove:'移除',save:'保存',close:'关闭',optional:'可选',host:'主机',port:'端口',protocol:'协议',password:'密码',username:'用户名',address:'地址',latency:'延迟',action:'操作',status:'状态',process:'进程',pid:'PID',localAddr:'本地地址',remoteAddr:'远端地址',state:'状态',traffic:'流量' },
    statusbar: { ram:'内存:' },
    settings: { language:{label:'显示语言',desc:'选择应用的显示语言'},theme:{label:'主题',desc:'选择你偏好的配色方案'},themeSystem:'跟随系统',themeLight:'浅色',themeDark:'深色',primaryColor:{label:'主题色',desc:'自定义应用的主色调'},titleBar:{label:'标题栏',desc:'在系统原生与自定义标题栏之间切换'},titleSystem:'系统',titleCustom:'自定义',closeBehavior:{label:'关闭按钮行为',desc:'启用后关闭时会显示确认提示'} },
    monitor: { totalConn:'总连接数',proxyTraffic:'代理流量',directTraffic:'直连流量',listening:'监听中',processes:'进程数',viaProxy:'走代理',tabConnections:'连接',tabRules:'代理规则',filterAll:'全部',filterProxy:'代理',filterDirect:'直连',filterListen:'监听',emptyTitle:'暂无连接数据',emptySub:'点击刷新获取当前 TCP 连接',rulesEmptyTitle:'未定义代理规则',rulesEmptySub:'添加应用以强制其流量走代理',addRule:'添加应用',auto:'自动',searchPlaceholder:'按进程或地址筛选...',appPath:'应用路径',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'输入需要强制走代理的可执行文件的完整路径。',proxyrules:'代理规则'},
    logs: {levelAll:'全部',levelInfo:'信息',levelOk:'正常',levelError:'错误',copyAll:'复制全部',copyVisible:'复制可见',autoScroll:'自动滚动',newEntries:'{0} 条新',tooltipCopy:'复制',tooltipClear:'清空',  filter:'筛选...',emptyTitle:'暂无日志',emptySub:'运行测速或扫描后将看到输出',clear:'清空',export:'导出'},
    scan: {targetNetwork:'目标网络',portRange:'端口范围',performance:'性能',statusIdle:'空闲',resultCount:'{0} 个结果',colIp:'IP 地址',colPort:'端口',colProtocol:'协议',colLatency:'延迟',colApply:'应用',progressLabel:'已扫描: {0} / {1}',foundLabel:'发现: {0}',statScanned:'总扫描数',statPortsOpen:'开放端口',statFoundProxies:'发现代理',statAvgLatency:'平均延迟',statScanSpeed:'扫描速度',clear:'清除',  network:'网段',subnet:'子网掩码',from:'起始',to:'结束',synThreads:'SYN 线程',synTimeout:'SYN 超时',verifyThreads:'验证线程',verifyTimeout:'验证超时',start:'开始',stop:'停止',filter:'筛选结果...',emptyTitle:'暂未发现代理',emptySub:'开始扫描以发现网络中的活跃代理',progress:'已扫描',found:'发现',openPorts:'开放端口' },
    test: {tabManual:'手动测试',tabPool:'代理池',protocol:'协议',clear:'清除',fetchImport:'获取并导入',testAll:'全部测试',sync:'同步',clearPool:'清空池',statMin:'最小',statMax:'最大',statAvg:'平均',statLoss:'丢包',recentTests:'最近测试',statusReady:'就绪',proxyCount:'{0} 个代理',filter:'筛选结果...',statusFilter:'状态',statusAll:'全部状态',statusOk:'正常',statusError:'异常',statusUntested:'未测试',  address:'地址',timeout:'超时',interval:'间隔',times:'次数',start:'开始',stop:'停止',clearHistory:'清除历史',subscriptionUrl:'订阅链接 / URL',fetch:'获取',poolEmpty:'代理池为空',poolEmptySub:'在配置页面添加代理或扫描发现新代理',type:'类型',colHost:'主机',colPort:'端口',colType:'类型',colLatency:'延迟',colAction:'操作',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可选',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'系统代理设置',localProxyDetect:'本地代理检测',refreshLocal:'刷新',localProxyDesc:'自动扫描本机常见代理端口，检测正在运行的代理服务。点击端口或进程名可以直接填入上方配置表单。',localProxyChecking:'正在检测本地代理服务...',clearHistory:'清除历史',adminLockTitle:'管理员权限状态',  proxyAddress:'地址',proxyPort:'端口',proxyProtocol:'协议',proxyUsername:'用户名',proxyPassword:'密码',apply:'应用系统代理',disconnect:'断开',test_connectivity:'连通性测试',testing:'测试中...',test_success:'连接成功 ({0}ms)',test_failed:'连接失败',test_before_apply:'请先测试连通性后再应用',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可选',recentConfigs:'最近配置',empty:'暂无保存的配置' },
  },
  zh_tw: {
    nav: { test:'測速',scan:'掃描',config:'配置',logs:'日誌',monitor:'監控',settings:'設定' },
    common: { refresh:'重新整理',filter:'篩選...',filterResults:'篩選結果...',cancel:'取消',add:'新增',delete:'刪除',remove:'移除',save:'儲存',close:'關閉',optional:'可選',host:'主機',port:'連接埠',protocol:'協定',password:'密碼',username:'使用者名稱',address:'地址',latency:'延遲',action:'操作',status:'狀態',process:'程序',pid:'PID',localAddr:'本機地址',remoteAddr:'遠端地址',state:'狀態',traffic:'流量' },
    statusbar: { ram:'記憶體:' },
    settings: { language:{label:'顯示語言',desc:'選擇應用程式的顯示語言'},theme:{label:'主題',desc:'選擇你偏好的配色方案'},themeSystem:'跟隨系統',themeLight:'淺色',themeDark:'深色',primaryColor:{label:'主題色',desc:'自訂應用程式的主色調'},titleBar:{label:'標題列',desc:'在系統原生與自訂標題列之間切換'},titleSystem:'系統',titleCustom:'自訂',closeBehavior:{label:'關閉按鈕行為',desc:'啟用後關閉時會顯示確認提示'} },
    monitor: { totalConn:'總連線數',proxyTraffic:'代理流量',directTraffic:'直接流量',listening:'監聽中',processes:'程序數',viaProxy:'走代理',tabConnections:'連線',tabRules:'代理規則',filterAll:'全部',filterProxy:'代理',filterDirect:'直接',filterListen:'監聽',emptyTitle:'暫無連線資料',emptySub:'點擊重新整理以獲取目前 TCP 連線',rulesEmptyTitle:'未定義代理規則',rulesEmptySub:'新增應用程式以強制其流量走代理',addRule:'新增應用程式',auto:'自動',searchPlaceholder:'按程序或地址篩選...',appPath:'應用程式路徑',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'輸入需要強制走代理的可執行檔案的完整路徑。',proxyrules:'代理規則'},
    logs: {levelAll:'全部',levelInfo:'資訊',levelOk:'正常',levelError:'錯誤',copyAll:'複製全部',copyVisible:'複製可見',autoScroll:'自動滾動',newEntries:'{0} 條新',tooltipCopy:'複製',tooltipClear:'清空',  filter:'篩選...',emptyTitle:'暫無日誌',emptySub:'執行測速或掃描後將在此看到輸出',clear:'清空',export:'匯出'},
    scan: {targetNetwork:'目標網路',portRange:'連接埠範圍',performance:'效能',statusIdle:'空閒',resultCount:'{0} 個結果',colIp:'IP 地址',colPort:'連接埠',colProtocol:'協定',colLatency:'延遲',colApply:'套用',progressLabel:'已掃描: {0} / {1}',foundLabel:'發現: {0}',statScanned:'總掃描數',statPortsOpen:'開放埠',statFoundProxies:'發現代理',statAvgLatency:'平均延遲',statScanSpeed:'掃描速度',clear:'清除',  network:'網段',subnet:'子網路遮罩',from:'起始',to:'結束',synThreads:'SYN 執行緒',synTimeout:'SYN 逾時',verifyThreads:'驗證執行緒',verifyTimeout:'驗證逾時',start:'開始',stop:'停止',filter:'篩選結果...',emptyTitle:'暫未發現代理',emptySub:'開始掃描以發現網路中的活躍代理',progress:'已掃描',found:'發現',openPorts:'開放埠' },
    test: {tabManual:'手動測試',tabPool:'代理池',protocol:'協定',clear:'清除',fetchImport:'取得並匯入',testAll:'全部測試',sync:'同步',clearPool:'清空池',statMin:'最小',statMax:'最大',statAvg:'平均',statLoss:'丟包',recentTests:'最近測試',statusReady:'就緒',proxyCount:'{0} 個代理',filter:'篩選結果...',statusFilter:'狀態',statusAll:'全部狀態',statusOk:'正常',statusError:'異常',statusUntested:'未測試',  address:'地址',timeout:'逾時',interval:'間隔',times:'次數',start:'開始',stop:'停止',clearHistory:'清除歷史',subscriptionUrl:'訂閱連結 / URL',fetch:'取得',poolEmpty:'代理池為空',poolEmptySub:'在設定頁面新增代理或掃描發現新代理',type:'類型',colHost:'主機',colPort:'連接埠',colType:'類型',colLatency:'延遲',colAction:'操作',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可選',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'系統代理設定',localProxyDetect:'本地代理檢測',refreshLocal:'重新整理',localProxyDesc:'自動掃描本機常見代理連接埠，檢測正在執行的代理服務。點擊連接埠或程序名稱可直接填入上方設定表單。',localProxyChecking:'正在檢測本地代理服務...',clearHistory:'清除歷史',adminLockTitle:'管理員權限狀態',  proxyAddress:'地址',proxyPort:'連接埠',proxyProtocol:'協定',proxyUsername:'使用者名稱',proxyPassword:'密碼',apply:'套用系統代理',disconnect:'斷開',test_connectivity:'連通性測試',testing:'測試中...',test_success:'連線成功 ({0}ms)',test_failed:'連線失敗',test_before_apply:'請先測試連通性後再套用',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可選',recentConfigs:'最近設定',empty:'暫無儲存的設定' },
  },
  ja: {
    nav: { test:'テスト',scan:'スキャン',config:'設定',logs:'ログ',monitor:'モニター',settings:'設定' },
    common: { refresh:'更新',filter:'フィルター...',filterResults:'結果をフィルター...',cancel:'キャンセル',add:'追加',delete:'削除',remove:'削除',save:'保存',close:'閉じる',optional:'任意',host:'ホスト',port:'ポート',protocol:'プロトコル',password:'パスワード',username:'ユーザー名',address:'アドレス',latency:'レイテンシ',action:'操作',status:'ステータス',process:'プロセス',pid:'PID',localAddr:'ローカルアドレス',remoteAddr:'リモートアドレス',state:'状態',traffic:'トラフィック' },
    statusbar: { ram:'RAM:' },
    settings: { language:{label:'言語',desc:'アプリケーションの表示言語を選択'},theme:{label:'テーマ',desc:'配色を選択してください'},themeSystem:'システム',themeLight:'ライト',themeDark:'ダーク',primaryColor:{label:'テーマカラー',desc:'アプリケーションのアクセントカラーをカスタマイズ'},titleBar:{label:'タイトルバー',desc:'システムネイティブとカスタムタイトルバーを切り替え'},titleSystem:'システム',titleCustom:'カスタム',closeBehavior:{label:'閉じる動作',desc:'有効にすると閉じる前に確認ダイアログを表示'} },
    monitor: { totalConn:'総接続数',proxyTraffic:'プロキシ',directTraffic:'ダイレクト',listening:'リッスン',processes:'プロセス数',viaProxy:'プロキシ経由',tabConnections:'接続',tabRules:'プロキシルール',filterAll:'すべて',filterProxy:'プロキシ',filterDirect:'ダイレクト',filterListen:'リッスン',emptyTitle:'接続がありません',emptySub:'更新をクリックして TCP 接続を取得',rulesEmptyTitle:'プロキシルールが未定義',rulesEmptySub:'アプリケーションを追加してプロキシ経由に設定',addRule:'アプリ追加',auto:'自動',searchPlaceholder:'プロセスまたはアドレスでフィルター...',appPath:'アプリケーションパス',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'プロキシ経由にしたい実行ファイルのフルパスを入力。',proxyrules:'プロキシルール'},
    logs: {levelAll:'すべて',levelInfo:'情報',levelOk:'OK',levelError:'エラー',copyAll:'すべてコピー',copyVisible:'表示中をコピー',autoScroll:'自動スクロール',newEntries:'{0} 件の新規',tooltipCopy:'コピー',tooltipClear:'クリア',  filter:'フィルター...',emptyTitle:'ログがありません',emptySub:'テストまたはスキャンを実行するとここに出力されます',clear:'クリア',export:'エクスポート'},
    scan: {targetNetwork:'ターゲットネットワーク',portRange:'ポート範囲',performance:'パフォーマンス',statusIdle:'待機中',resultCount:'{0} 件の結果',colIp:'IP アドレス',colPort:'ポート',colProtocol:'プロトコル',colLatency:'レイテンシ',colApply:'適用',progressLabel:'スキャン済み: {0} / {1}',foundLabel:'検出: {0}',statScanned:'総スキャン数',statPortsOpen:'開いているポート',statFoundProxies:'検出プロキシ',statAvgLatency:'平均レイテンシ',statScanSpeed:'スキャン速度',clear:'クリア',  network:'ネットワーク',subnet:'サブネット',from:'開始',to:'終了',synThreads:'SYN スレッド',synTimeout:'SYN タイムアウト',verifyThreads:'検証スレッド',verifyTimeout:'検証タイムアウト',start:'開始',stop:'停止',filter:'結果をフィルター...',emptyTitle:'プロキシが見つかりません',emptySub:'スキャンを開始してネットワーク上のプロキシを検出',progress:'スキャン済み',found:'検出',openPorts:'開いているポート' },
    test: {tabManual:'手動テスト',tabPool:'プロキシプール',protocol:'プロトコル',clear:'クリア',fetchImport:'取得してインポート',testAll:'すべてテスト',sync:'同期',clearPool:'プールをクリア',statMin:'最小',statMax:'最大',statAvg:'平均',statLoss:'損失',recentTests:'最近のテスト',statusReady:'準備完了',proxyCount:'{0} プロキシ',filter:'結果をフィルター...',statusFilter:'ステータス',statusAll:'すべて',statusOk:'正常',statusError:'異常',statusUntested:'未テスト',  address:'アドレス',timeout:'タイムアウト',interval:'間隔',times:'回数',start:'開始',stop:'停止',clearHistory:'履歴を消去',subscriptionUrl:'サブスクリプション URL',fetch:'取得',poolEmpty:'プロキシプールが空',poolEmptySub:'設定ページでプロキシを追加するかスキャンで発見',type:'種類',colHost:'ホスト',colPort:'ポート',colType:'種類',colLatency:'レイテンシ',colAction:'操作',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'任意',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'システムプロキシ設定',localProxyDetect:'ローカルプロキシ検出',refreshLocal:'更新',localProxyDesc:'ローカルの一般的なプロキシポートを自動スキャンし、実行中のプロキシサービスを検出します。ポートまたはプロセス名をクリックすると、上の設定フォームに直接入力できます。',localProxyChecking:'ローカルプロキシサービスを検出中...',clearHistory:'履歴を消去',adminLockTitle:'管理者権限ステータス',  proxyAddress:'アドレス',proxyPort:'ポート',proxyProtocol:'プロトコル',proxyUsername:'ユーザー名',proxyPassword:'パスワード',apply:'システムプロキシに適用',disconnect:'切断',test_connectivity:'接続テスト',testing:'テスト中...',test_success:'接続成功 ({0}ms)',test_failed:'接続失敗',test_before_apply:'接続テスト後に適用を有効化',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'任意',recentConfigs:'最近の設定',empty:'保存された設定はありません' },
  },
};

let _currentLang = 'en';

function t(key) {
  var parts = key.split('.');
  var obj = LOCALE[_currentLang];
  for (var i = 0; i < parts.length; i++) {
    if (obj == null) return key;
    obj = obj[parts[i]];
  }
  return (obj != null && typeof obj === 'string') ? obj : key;
}

function applyLanguage(lang) {
  if (lang && LOCALE[lang]) {
    _currentLang = lang;
    saveToStorage('language', lang);
  }
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-value]').forEach(function(el) {
    el.value = t(el.getAttribute('data-i18n-value'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  document.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: _currentLang } }));
}

function getCurrentLang() { return _currentLang; }
function getLangLabel(lang) { return LANGUAGES[lang] || lang; }

(function initLanguage() {
  var saved = loadFromStorage('language', 'en');
  if (LOCALE[saved]) _currentLang = saved;
})();

window.t = t;
window.applyLanguage = applyLanguage;
window.getCurrentLang = getCurrentLang;
window.getLangLabel = getLangLabel;
window.LANGUAGES = LANGUAGES;
