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
    settings: { language:{label:'Language',desc:'Select display language for the application'},theme:{label:'Theme',desc:'Choose your preferred color scheme'},themeSystem:'System',themeLight:'Light',themeDark:'Dark',primaryColor:{label:'Primary Color',desc:'Customize the application accent color'},titleBar:{label:'Title Bar',desc:'Choose between system native or custom title bar'},titleSystem:'System',titleCustom:'Custom',closeBehavior:{label:'Close Button Behavior',desc:'When enabled, closing shows confirmation before exit'},exportDir:{label:'Export Directory',desc:'All exported files (JSON, XML, XLSX) will be saved to this folder. Leave empty to use browser default download.',empty:'Not set — uses browser download',browse:'Browse'} },
    monitor: { totalConn:'Total Connections',proxyTraffic:'Proxy Traffic',directTraffic:'Direct Traffic',listening:'Listening',processes:'Processes',viaProxy:'Via Proxy',tabConnections:'Connections',tabRules:'Proxy Rules',filterAll:'All',filterProxy:'Proxy',filterDirect:'Direct',filterListen:'Listening',emptyTitle:'No connections to display',emptySub:'Click Refresh to fetch current TCP connections',rulesEmptyTitle:'No proxy rules defined',rulesEmptySub:'Add applications to force them through the proxy',addRule:'Add Application',auto:'Auto',searchPlaceholder:'Filter by process or address...',appPath:'Application Path',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'Enter the full path to the executable you want to force through the proxy.',proxyrules:'Proxy Rules' },
    logs: {levelAll:'All',levelInfo:'Info',levelOk:'OK',levelError:'Error',copyAll:'Copy All',copyVisible:'Copy Visible',autoScroll:'Auto-scroll',newEntries:'{0} new',tooltipCopy:'Copy',tooltipClear:'Clear',  filter:'Filter...',emptyTitle:'No log entries',emptySub:'Run a test or scan to see output here',clear:'Clear',export:'Export' },
    scan: {targetNetwork:'Target Network',portRange:'Port Range',performance:'Performance',statusIdle:'Idle',resultCount:'{0} results',colIp:'IP Address',colPort:'Port',colProtocol:'Protocol',colLatency:'Latency',colApply:'Apply',progressLabel:'Scanned: {0} / {1}',foundLabel:'Found: {0}',statScanned:'Total Scanned',statPortsOpen:'Ports Open',statFoundProxies:'Found Proxies',statAvgLatency:'Avg Latency',statScanSpeed:'Scan Speed',clear:'Clear',export:'Export Results',  network:'Network',subnet:'Subnet',from:'From',to:'To',synThreads:'SYN Threads',synTimeout:'SYN Timeout',verifyThreads:'Verify Threads',verifyTimeout:'Verify Timeout',start:'Start',stop:'Stop',filter:'Filter results...',emptyTitle:'No proxies found yet',emptySub:'Start a scan to discover active proxies on your network',progress:'Scanned',found:'Found',openPorts:'Open Ports' },
    test: {tabManual:'Manual Probe',tabPool:'Proxy Pool',protocol:'Protocol',clear:'Clear',fetchImport:'Fetch & Import',testAll:'Test All',sync:'Sync',clearPool:'Clear Pool',statMin:'Min',statMax:'Max',statAvg:'Avg',statLoss:'Loss',recentTests:'Recent Tests',statusReady:'Ready',proxyCount:'{0} Proxies',filter:'Filter results...',statusFilter:'Status',statusAll:'All Status',statusOk:'OK',statusError:'Error',statusUntested:'Untested',  address:'Address',port:'Port',timeout:'Timeout',interval:'Interval',times:'Times',start:'Start',stop:'Stop',clearHistory:'Clear History',subscriptionUrl:'Subscription Link / URL',fetch:'Fetch',poolEmpty:'Proxy Pool Empty',poolEmptySub:'Add proxies in the Config page or Scan for new ones',type:'Type',colHost:'Host',colPort:'Port',colType:'Type',colLatency:'Latency',colAction:'Action',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'Optional',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'System Proxy Setup',localProxyDetect:'Local Proxy Detection',refreshLocal:'Refresh',localProxyDesc:'Automatically scan local proxy ports and detect running proxy services. Click on a port or process name to fill in the form above.',localProxyChecking:'Detecting local proxy services...',clearHistory:'Clear History',adminLockTitle:'Administrator Privilege Status',exportPool:'Export Proxy Pool',  proxyAddress:'Address',proxyPort:'Port',proxyProtocol:'Protocol',proxyUsername:'Username',proxyPassword:'Password',apply:'Apply System Proxy',disconnect:'Disconnect',test_connectivity:'Test Connection',testing:'Testing...',test_success:'Connected in {0}ms',test_failed:'Connection failed',test_before_apply:'Test connection first to enable Apply',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'Optional',recentConfigs:'Recent Configurations',empty:'No saved configurations',  ipRateLimit:'IP Rate Limit',ipRateLimitDesc:'Set per-IP upload/download speed limits for clients connecting to the local proxy.',ipUploadLimit:'Upload',ipDownloadLimit:'Download',addRateLimit:'Add',noRateLimits:'No IP rate limits configured',unlimited:'Unlimited',ipRateLimitHint:'0 = unlimited, takes effect immediately',colIp:'Client IP',uploadSpeed:'Upload Speed',downloadSpeed:'Download Speed' },
  },
  zh_cn: {
    nav: { test:'测速',scan:'扫描',config:'配置',logs:'日志',monitor:'监控',settings:'设置' },
    common: { refresh:'刷新',filter:'筛选...',filterResults:'筛选结果...',cancel:'取消',add:'添加',delete:'删除',remove:'移除',save:'保存',close:'关闭',optional:'可选',host:'主机',port:'端口',protocol:'协议',password:'密码',username:'用户名',address:'地址',latency:'延迟',action:'操作',status:'状态',process:'进程',pid:'PID',localAddr:'本地地址',remoteAddr:'远端地址',state:'状态',traffic:'流量' },
    statusbar: { ram:'内存:' },
    settings: { language:{label:'显示语言',desc:'选择应用的显示语言'},theme:{label:'主题',desc:'选择你偏好的配色方案'},themeSystem:'跟随系统',themeLight:'浅色',themeDark:'深色',primaryColor:{label:'主题色',desc:'自定义应用的主色调'},titleBar:{label:'标题栏',desc:'在系统原生与自定义标题栏之间切换'},titleSystem:'系统',titleCustom:'自定义',closeBehavior:{label:'关闭按钮行为',desc:'启用后关闭时会显示确认提示'},exportDir:{label:'导出目录',desc:'所有导出的文件（JSON、XML、XLSX）将保存到此文件夹。留空则使用浏览器默认下载。',empty:'未设置 — 使用浏览器下载',browse:'浏览'} },
    monitor: { totalConn:'总连接数',proxyTraffic:'代理流量',directTraffic:'直连流量',listening:'监听中',processes:'进程数',viaProxy:'走代理',tabConnections:'连接',tabRules:'代理规则',filterAll:'全部',filterProxy:'代理',filterDirect:'直连',filterListen:'监听',emptyTitle:'暂无连接数据',emptySub:'点击刷新获取当前 TCP 连接',rulesEmptyTitle:'未定义代理规则',rulesEmptySub:'添加应用以强制其流量走代理',addRule:'添加应用',auto:'自动',searchPlaceholder:'按进程或地址筛选...',appPath:'应用路径',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'输入需要强制走代理的可执行文件的完整路径。',proxyrules:'代理规则'},
    logs: {levelAll:'全部',levelInfo:'信息',levelOk:'正常',levelError:'错误',copyAll:'复制全部',copyVisible:'复制可见',autoScroll:'自动滚动',newEntries:'{0} 条新',tooltipCopy:'复制',tooltipClear:'清空',  filter:'筛选...',emptyTitle:'暂无日志',emptySub:'运行测速或扫描后将看到输出',clear:'清空',export:'导出'},
    scan: {targetNetwork:'目标网络',portRange:'端口范围',performance:'性能',statusIdle:'空闲',resultCount:'{0} 个结果',colIp:'IP 地址',colPort:'端口',colProtocol:'协议',colLatency:'延迟',colApply:'应用',progressLabel:'已扫描: {0} / {1}',foundLabel:'发现: {0}',statScanned:'总扫描数',statPortsOpen:'开放端口',statFoundProxies:'发现代理',statAvgLatency:'平均延迟',statScanSpeed:'扫描速度',clear:'清除',export:'导出结果',  network:'网段',subnet:'子网掩码',from:'起始',to:'结束',synThreads:'SYN 线程',synTimeout:'SYN 超时',verifyThreads:'验证线程',verifyTimeout:'验证超时',start:'开始',stop:'停止',filter:'筛选结果...',emptyTitle:'暂未发现代理',emptySub:'开始扫描以发现网络中的活跃代理',progress:'已扫描',found:'发现',openPorts:'开放端口' },
    test: {tabManual:'手动测试',tabPool:'代理池',protocol:'协议',clear:'清除',fetchImport:'获取并导入',testAll:'全部测试',sync:'同步',clearPool:'清空池',statMin:'最小',statMax:'最大',statAvg:'平均',statLoss:'丢包',recentTests:'最近测试',statusReady:'就绪',proxyCount:'{0} 个代理',filter:'筛选结果...',statusFilter:'状态',statusAll:'全部状态',statusOk:'正常',statusError:'异常',statusUntested:'未测试',  address:'地址',port:'端口',timeout:'超时',interval:'间隔',times:'次数',start:'开始',stop:'停止',clearHistory:'清除历史',subscriptionUrl:'订阅链接 / URL',fetch:'获取',poolEmpty:'代理池为空',poolEmptySub:'在配置页面添加代理或扫描发现新代理',type:'类型',colHost:'主机',colPort:'端口',colType:'类型',colLatency:'延迟',colAction:'操作',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可选',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'系统代理设置',localProxyDetect:'本地代理检测',refreshLocal:'刷新',localProxyDesc:'自动扫描本机常见代理端口，检测正在运行的代理服务。点击端口或进程名可以直接填入上方配置表单。',localProxyChecking:'正在检测本地代理服务...',clearHistory:'清除历史',adminLockTitle:'管理员权限状态',exportPool:'导出代理池',  proxyAddress:'地址',proxyPort:'端口',proxyProtocol:'协议',proxyUsername:'用户名',proxyPassword:'密码',apply:'应用系统代理',disconnect:'断开',test_connectivity:'连通性测试',testing:'测试中...',test_success:'连接成功 ({0}ms)',test_failed:'连接失败',test_before_apply:'请先测试连通性后再应用',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可选',recentConfigs:'最近配置',empty:'暂无保存的配置',  ipRateLimit:'IP 限速',ipRateLimitDesc:'为连接到本地代理的指定客户端 IP 设置上传/下载限速。',ipUploadLimit:'上传',ipDownloadLimit:'下载',addRateLimit:'添加',noRateLimits:'暂无 IP 限速配置',unlimited:'不限速',ipRateLimitHint:'0 = 不限速，修改后即时生效',colIp:'客户端 IP',uploadSpeed:'上传速率',downloadSpeed:'下载速率' },
  },
  zh_tw: {
    nav: { test:'測速',scan:'掃描',config:'配置',logs:'日誌',monitor:'監控',settings:'設定' },
    common: { refresh:'重新整理',filter:'篩選...',filterResults:'篩選結果...',cancel:'取消',add:'新增',delete:'刪除',remove:'移除',save:'儲存',close:'關閉',optional:'可選',host:'主機',port:'連接埠',protocol:'協定',password:'密碼',username:'使用者名稱',address:'地址',latency:'延遲',action:'操作',status:'狀態',process:'程序',pid:'PID',localAddr:'本機地址',remoteAddr:'遠端地址',state:'狀態',traffic:'流量' },
    statusbar: { ram:'記憶體:' },
    settings: { language:{label:'顯示語言',desc:'選擇應用程式的顯示語言'},theme:{label:'主題',desc:'選擇你偏好的配色方案'},themeSystem:'跟隨系統',themeLight:'淺色',themeDark:'深色',primaryColor:{label:'主題色',desc:'自訂應用程式的主色調'},titleBar:{label:'標題列',desc:'在系統原生與自訂標題列之間切換'},titleSystem:'系統',titleCustom:'自訂',closeBehavior:{label:'關閉按鈕行為',desc:'啟用後關閉時會顯示確認提示'},exportDir:{label:'匯出目錄',desc:'所有匯出的檔案（JSON、XML、XLSX）將儲存到此資料夾。留空則使用瀏覽器預設下載。',empty:'未設定 — 使用瀏覽器下載',browse:'瀏覽'} },
    monitor: { totalConn:'總連線數',proxyTraffic:'代理流量',directTraffic:'直接流量',listening:'監聽中',processes:'程序數',viaProxy:'走代理',tabConnections:'連線',tabRules:'代理規則',filterAll:'全部',filterProxy:'代理',filterDirect:'直接',filterListen:'監聽',emptyTitle:'暫無連線資料',emptySub:'點擊重新整理以獲取目前 TCP 連線',rulesEmptyTitle:'未定義代理規則',rulesEmptySub:'新增應用程式以強制其流量走代理',addRule:'新增應用程式',auto:'自動',searchPlaceholder:'按程序或地址篩選...',appPath:'應用程式路徑',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'輸入需要強制走代理的可執行檔案的完整路徑。',proxyrules:'代理規則'},
    logs: {levelAll:'全部',levelInfo:'資訊',levelOk:'正常',levelError:'錯誤',copyAll:'複製全部',copyVisible:'複製可見',autoScroll:'自動滾動',newEntries:'{0} 條新',tooltipCopy:'複製',tooltipClear:'清空',  filter:'篩選...',emptyTitle:'暫無日誌',emptySub:'執行測速或掃描後將在此看到輸出',clear:'清空',export:'匯出'},
    scan: {targetNetwork:'目標網路',portRange:'連接埠範圍',performance:'效能',statusIdle:'空閒',resultCount:'{0} 個結果',colIp:'IP 地址',colPort:'連接埠',colProtocol:'協定',colLatency:'延遲',colApply:'套用',progressLabel:'已掃描: {0} / {1}',foundLabel:'發現: {0}',statScanned:'總掃描數',statPortsOpen:'開放埠',statFoundProxies:'發現代理',statAvgLatency:'平均延遲',statScanSpeed:'掃描速度',clear:'清除',export:'匯出結果',  network:'網段',subnet:'子網路遮罩',from:'起始',to:'結束',synThreads:'SYN 執行緒',synTimeout:'SYN 逾時',verifyThreads:'驗證執行緒',verifyTimeout:'驗證逾時',start:'開始',stop:'停止',filter:'篩選結果...',emptyTitle:'暫未發現代理',emptySub:'開始掃描以發現網路中的活躍代理',progress:'已掃描',found:'發現',openPorts:'開放埠' },
    test: {tabManual:'手動測試',tabPool:'代理池',protocol:'協定',clear:'清除',fetchImport:'取得並匯入',testAll:'全部測試',sync:'同步',clearPool:'清空池',statMin:'最小',statMax:'最大',statAvg:'平均',statLoss:'丟包',recentTests:'最近測試',statusReady:'就緒',proxyCount:'{0} 個代理',filter:'篩選結果...',statusFilter:'狀態',statusAll:'全部狀態',statusOk:'正常',statusError:'異常',statusUntested:'未測試',  address:'地址',port:'連接埠',timeout:'逾時',interval:'間隔',times:'次數',start:'開始',stop:'停止',clearHistory:'清除歷史',subscriptionUrl:'訂閱連結 / URL',fetch:'取得',poolEmpty:'代理池為空',poolEmptySub:'在設定頁面新增代理或掃描發現新代理',type:'類型',colHost:'主機',colPort:'連接埠',colType:'類型',colLatency:'延遲',colAction:'操作',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可選',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'系統代理設定',localProxyDetect:'本地代理檢測',refreshLocal:'重新整理',localProxyDesc:'自動掃描本機常見代理連接埠，檢測正在執行的代理服務。點擊連接埠或程序名稱可直接填入上方設定表單。',localProxyChecking:'正在檢測本地代理服務...',clearHistory:'清除歷史',adminLockTitle:'管理員權限狀態',exportPool:'匯出代理池',  proxyAddress:'地址',proxyPort:'連接埠',proxyProtocol:'協定',proxyUsername:'使用者名稱',proxyPassword:'密碼',apply:'套用系統代理',disconnect:'斷開',test_connectivity:'連通性測試',testing:'測試中...',test_success:'連線成功 ({0}ms)',test_failed:'連線失敗',test_before_apply:'請先測試連通性後再套用',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'可選',recentConfigs:'最近設定',empty:'暫無儲存的設定',  ipRateLimit:'IP 限速',ipRateLimitDesc:'為連接到本地代理的指定用戶端 IP 設定上傳/下載限速。',ipUploadLimit:'上傳',ipDownloadLimit:'下載',addRateLimit:'新增',noRateLimits:'暫無 IP 限速配置',unlimited:'不限速',ipRateLimitHint:'0 = 不限速，修改後即時生效',colIp:'用戶端 IP',uploadSpeed:'上傳速率',downloadSpeed:'下載速率' },
  },
  ja: {
    nav: { test:'テスト',scan:'スキャン',config:'設定',logs:'ログ',monitor:'モニター',settings:'設定' },
    common: { refresh:'更新',filter:'フィルター...',filterResults:'結果をフィルター...',cancel:'キャンセル',add:'追加',delete:'削除',remove:'削除',save:'保存',close:'閉じる',optional:'任意',host:'ホスト',port:'ポート',protocol:'プロトコル',password:'パスワード',username:'ユーザー名',address:'アドレス',latency:'レイテンシ',action:'操作',status:'ステータス',process:'プロセス',pid:'PID',localAddr:'ローカルアドレス',remoteAddr:'リモートアドレス',state:'状態',traffic:'トラフィック' },
    statusbar: { ram:'RAM:' },
    settings: { language:{label:'言語',desc:'アプリケーションの表示言語を選択'},theme:{label:'テーマ',desc:'配色を選択してください'},themeSystem:'システム',themeLight:'ライト',themeDark:'ダーク',primaryColor:{label:'テーマカラー',desc:'アプリケーションのアクセントカラーをカスタマイズ'},titleBar:{label:'タイトルバー',desc:'システムネイティブとカスタムタイトルバーを切り替え'},titleSystem:'システム',titleCustom:'カスタム',closeBehavior:{label:'閉じる動作',desc:'有効にすると閉じる前に確認ダイアログを表示'},exportDir:{label:'エクスポートディレクトリ',desc:'エクスポートされたファイル（JSON、XML、XLSX）はこのフォルダに保存されます。空の場合はブラウザのデフォルトダウンロードを使用します。',empty:'未設定 — ブラウザダウンロードを使用',browse:'参照'} },
    monitor: { totalConn:'総接続数',proxyTraffic:'プロキシ',directTraffic:'ダイレクト',listening:'リッスン',processes:'プロセス数',viaProxy:'プロキシ経由',tabConnections:'接続',tabRules:'プロキシルール',filterAll:'すべて',filterProxy:'プロキシ',filterDirect:'ダイレクト',filterListen:'リッスン',emptyTitle:'接続がありません',emptySub:'更新をクリックして TCP 接続を取得',rulesEmptyTitle:'プロキシルールが未定義',rulesEmptySub:'アプリケーションを追加してプロキシ経由に設定',addRule:'アプリ追加',auto:'自動',searchPlaceholder:'プロセスまたはアドレスでフィルター...',appPath:'アプリケーションパス',appPathPlaceholder:'C:\Program Files\App\app.exe',appPathDesc:'プロキシ経由にしたい実行ファイルのフルパスを入力。',proxyrules:'プロキシルール'},
    logs: {levelAll:'すべて',levelInfo:'情報',levelOk:'OK',levelError:'エラー',copyAll:'すべてコピー',copyVisible:'表示中をコピー',autoScroll:'自動スクロール',newEntries:'{0} 件の新規',tooltipCopy:'コピー',tooltipClear:'クリア',  filter:'フィルター...',emptyTitle:'ログがありません',emptySub:'テストまたはスキャンを実行するとここに出力されます',clear:'クリア',export:'エクスポート'},
    scan: {targetNetwork:'ターゲットネットワーク',portRange:'ポート範囲',performance:'パフォーマンス',statusIdle:'待機中',resultCount:'{0} 件の結果',colIp:'IP アドレス',colPort:'ポート',colProtocol:'プロトコル',colLatency:'レイテンシ',colApply:'適用',progressLabel:'スキャン済み: {0} / {1}',foundLabel:'検出: {0}',statScanned:'総スキャン数',statPortsOpen:'開いているポート',statFoundProxies:'検出プロキシ',statAvgLatency:'平均レイテンシ',statScanSpeed:'スキャン速度',clear:'クリア',export:'結果をエクスポート',  network:'ネットワーク',subnet:'サブネット',from:'開始',to:'終了',synThreads:'SYN スレッド',synTimeout:'SYN タイムアウト',verifyThreads:'検証スレッド',verifyTimeout:'検証タイムアウト',start:'開始',stop:'停止',filter:'結果をフィルター...',emptyTitle:'プロキシが見つかりません',emptySub:'スキャンを開始してネットワーク上のプロキシを検出',progress:'スキャン済み',found:'検出',openPorts:'開いているポート' },
    test: {tabManual:'手動テスト',tabPool:'プロキシプール',protocol:'プロトコル',clear:'クリア',fetchImport:'取得してインポート',testAll:'すべてテスト',sync:'同期',clearPool:'プールをクリア',statMin:'最小',statMax:'最大',statAvg:'平均',statLoss:'損失',recentTests:'最近のテスト',statusReady:'準備完了',proxyCount:'{0} プロキシ',filter:'結果をフィルター...',statusFilter:'ステータス',statusAll:'すべて',statusOk:'正常',statusError:'異常',statusUntested:'未テスト',  address:'アドレス',port:'ポート',timeout:'タイムアウト',interval:'間隔',times:'回数',start:'開始',stop:'停止',clearHistory:'履歴を消去',subscriptionUrl:'サブスクリプション URL',fetch:'取得',poolEmpty:'プロキシプールが空',poolEmptySub:'設定ページでプロキシを追加するかスキャンで発見',type:'種類',colHost:'ホスト',colPort:'ポート',colType:'種類',colLatency:'レイテンシ',colAction:'操作',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'任意',placeholderSubUrl:'http://example.com/proxies.txt' },
    config: {systemSetup:'システムプロキシ設定',localProxyDetect:'ローカルプロキシ検出',refreshLocal:'更新',localProxyDesc:'ローカルの一般的なプロキシポートを自動スキャンし、実行中のプロキシサービスを検出します。ポートまたはプロセス名をクリックすると、上の設定フォームに直接入力できます。',localProxyChecking:'ローカルプロキシサービスを検出中...',clearHistory:'履歴を消去',adminLockTitle:'管理者権限ステータス',exportPool:'プロキシプールをエクスポート',  proxyAddress:'アドレス',proxyPort:'ポート',proxyProtocol:'プロトコル',proxyUsername:'ユーザー名',proxyPassword:'パスワード',apply:'システムプロキシに適用',disconnect:'切断',test_connectivity:'接続テスト',testing:'テスト中...',test_success:'接続成功 ({0}ms)',test_failed:'接続失敗',test_before_apply:'接続テスト後に適用を有効化',placeholderHost:'127.0.0.1',placeholderPort:'7890',placeholderOptional:'任意',recentConfigs:'最近の設定',empty:'保存された設定はありません',  ipRateLimit:'IP 帯域制限',ipRateLimitDesc:'ローカルプロキシに接続するクライアント IP ごとにアップロード/ダウンロード速度を制限します。',ipUploadLimit:'アップロード',ipDownloadLimit:'ダウンロード',addRateLimit:'追加',noRateLimits:'IP 帯域制限の設定なし',unlimited:'制限なし',ipRateLimitHint:'0 = 制限なし、即時反映',colIp:'クライアント IP',uploadSpeed:'アップロード速度',downloadSpeed:'ダウンロード速度' },
  },
};

const EXTRA_LOCALE = {
  en: {
    common: { unknown: 'Unknown' },
    test: { fetchClipboard: 'Paste from Clipboard' },
    config: {
      modeSystem: 'System Proxy', modeAppOnly: 'App Internal', modePac: 'PAC Mode',
      appOnlySetup: 'App Internal Proxy Config', pacSetup: 'PAC Proxy Config', saveConfig: 'Save Config', savePac: 'Save to PAC',
      localProxyStatus: 'Local Proxy Server Status', running: 'Running', stopped: 'Stopped', runningWithConnections: 'Running · {0} connections',
      listenAddress: 'Listen Address', currentConnections: 'Current Connections', upstreamTarget: 'Upstream Target', totalConnections: '{0} / {1} total',
      activeClients: 'Connected Clients', totalUpload: 'Total Upload', totalDownload: 'Total Download', noActiveClients: 'No connected clients',
      allowLanSharing: 'Allow LAN Sharing', allowLanSharingHint: 'Listen on 0.0.0.0 so other LAN devices can connect',
      localAuth: 'Client Authentication', localAuthHint: 'When enabled, clients must provide username and password to connect',
      localAuthSaved: 'Client authentication saved', localAuthDisabled: 'Client authentication disabled',
      listenPort: 'Listen Port', random: 'Random', randomPort: 'Generate random port', applyPort: 'Apply', listenPortHint: 'Empty = random. Restart proxy to take effect.',
      blockedIps: 'Blocked Target IPs', blockedIpsHint: 'Block traffic to specified IPs. Supports single IP or CIDR ranges. Only IP targets are affected; domains are not. Takes effect immediately.',
      blockedIpsHintBeforeSingle: 'Block traffic to specified IPs. Supports single IPs such as ',
      blockedIpsHintBetweenExamples: ', or CIDR ranges such as ',
      blockedIpsHintAfterExamples: '. Only IP targets are affected; domains are not. Takes effect immediately.',
      blockedIpPlaceholder: 'IP or CIDR, e.g. 10.0.0.0/8', noBlockedIps: 'No blocked IPs', blockedHeaderIp: 'IP Address', blockedHeaderAction: 'Action', removeBlockedTitle: 'Remove block',
      allowedIps: 'Relay Proxy Allowlist',
      allowedIpsHintBeforeSingle: 'Only allow specified IPs to use or access the app internal relay proxy. Supports single IPs such as ',
      allowedIpsHintBetweenExamples: ', or CIDR ranges such as ',
      allowedIpsHintAfterExamples: '. Cannot be enabled together with the blocklist; when enabled with an empty list, all connections are rejected.',
      allowedIpPlaceholder: 'IP or CIDR, e.g. 192.168.1.0/24', noAllowedIps: 'No allowed IPs', allowedHeaderIp: 'IP Address', removeAllowedTitle: 'Remove allow entry',
      rateIpPlaceholder: 'Client IP address', rateUploadPlaceholder: 'Upload KB/s', rateDownloadPlaceholder: 'Download KB/s',
      copyProxyAddress: 'Copy Proxy Address', restartProxy: 'Restart Proxy', stopLocalProxy: 'Stop Local Proxy', restarting: 'Restarting...',
      localProxyHintStopped: 'The app internal proxy listens on 127.0.0.1. Configure this proxy address in apps that should use it. System proxy settings are not changed.',
      localProxyHintStoppedBefore: 'The app internal proxy listens on ',
      localProxyHintStoppedAfter: '. Configure this proxy address in apps that should use it. System proxy settings are not changed.',
      localProxyHintShared: 'Proxy listens on 0.0.0.0. Other LAN devices can connect via {0}:{1}.',
      localProxyHintLocal: 'Proxy listens only on 127.0.0.1 and is available to this machine only.',
      sharingWillDisable: 'Sharing is off and will take effect after restarting proxy.',
      sharingWillEnable: 'Sharing is on and will take effect after restarting proxy.',
      pacRulesConfig: 'PAC Rules Config', enablePac: 'Enable PAC', pacEnabled: 'Enabled', pacDisabled: 'Disabled',
      addRule: 'Add Rule', previewPac: 'Preview PAC', noPacRules: 'No rules yet. Add a rule or configure a proxy server to create a default rule automatically.',
      domainPattern: 'Domain Pattern', domainPatternPlaceholder: '*.google.com, example.com, or * for all',
      proxyTarget: 'Proxy Target', proxyTargetPlaceholder: 'PROXY 127.0.0.1:7890, SOCKS5 ..., or DIRECT',
      pacRuleHint: 'Tip: * matches all domains; *.example.com matches subdomains. Proxy format: PROXY host:port, SOCKS5 host:port, or DIRECT.',
      pacRuleHintPrefix: 'Tip: ', pacRuleHintAll: ' matches all domains; ', pacRuleHintSubdomain: ' matches subdomains. Proxy format: ',
      pacRuleHintSeparator: ', ', pacRuleHintOr: ', or ',
      pacPreviewTitle: 'PAC Script Preview', allTraffic: 'All Traffic', edit: 'Edit',
      historyCleared: 'Configuration history cleared', switchModeFailed: 'Failed to switch mode: {0}',
      lanSharingEnabled: 'LAN sharing enabled. Restart proxy to take effect.', lanSharingDisabled: 'LAN sharing disabled.', saveFailed: 'Save failed: {0}',
      addressRequired: 'Please enter address', portRequired: 'Please enter port', desktopOnly: 'Only available in desktop app',
      testSuccessResult: 'Connected ({0}ms)', proxyConnectivityOk: 'Proxy connectivity OK ({0}ms)', proxyTestFailed: 'Proxy test failed',
      localProxyStartLog: 'Starting local proxy: {0}:{1} ({2})...', localProxyStarted: 'Local proxy started', localProxyStartFailed: 'Start failed: {0}',
      testFirst: 'Test connectivity first', applyPacLog: 'Apply PAC', applySystemLog: 'Apply system proxy',
      pacApplied: 'PAC config applied', proxyApplied: 'Proxy applied', disconnecting: 'Disconnecting proxy...', proxyDisconnected: 'Proxy disconnected', proxyActive: 'Proxy is active',
      ruleDeleted: 'Rule deleted', deleteFailed: 'Delete failed: {0}', pacRulesUpdated: 'PAC rules updated', pacRulesSaveFailed: 'Failed to save PAC rules: {0}',
      domainRequired: 'Please enter domain pattern', proxyRequired: 'Please enter proxy target', ruleAddFailed: 'Failed to add rule: {0}', ruleSaved: 'Rule saved',
      pacEnabledSnackbar: 'PAC enabled', pacDisabledSnackbar: 'PAC disabled', operationFailed: 'Operation failed: {0}', pacContentFailed: 'Failed to get PAC content',
      localProxyDesktopOnly: 'Proxy detection is only available in desktop app', localProxyNone: 'No running local proxy services detected', detectFailed: 'Detection failed: {0}',
      filledProxy: 'Filled {0}:{1} ({2})', localProxyNotRunning: 'Local proxy is not running', copied: 'Copied: {0}', copyFailed: 'Copy failed',
      localProxyStopped: 'Local proxy stopped', stopFailed: 'Stop failed: {0}', localProxyRestarted: 'Local proxy restarted', restartFailed: 'Restart failed: {0}',
      portAdminRequired: 'Ports below 1024 require administrator privileges', listenPortSet: 'Listen port set to {0}', listenPortRandomSet: 'Listen port set to random',
      blockedIpsEnabled: 'Blocklist enabled', blockedIpsDisabled: 'Blocklist disabled',
      allowedIpsEnabled: 'Allowlist enabled. Blocklist has been disabled.', allowedIpsDisabled: 'Allowlist disabled',
      blockedRemoved: 'Removed block: {0}', removeFailed: 'Remove failed: {0}', blockedIpRequired: 'Please enter the IP address to block', blockedAdded: 'Blocked: {0}', addFailed: 'Add failed',
      allowedRemoved: 'Removed allow entry: {0}', allowedIpRequired: 'Please enter the IP address to allow', allowedAdded: 'Allowed: {0}',
      poolEmpty: 'Proxy pool is empty — add proxies first', exportedJson: 'Exported {0} proxies as JSON', exportedXml: 'Exported {0} proxies as XML', exportedXlsx: 'Exported {0} proxies as XLSX', exportFailed: 'Export failed: {0}',
      ipRequired: 'IP address cannot be empty', rateLimitInvalid: 'Rate limit must be a non-negative integer', ipRateAdded: 'IP rate limit added: {0}', ipRateRemoved: 'Removed IP rate limit: {0}', unknownError: 'Unknown error',
    },
  },
  zh_cn: {
    common: { unknown: '未知' },
    test: { fetchClipboard: '从剪贴板获取' },
    config: {
      modeSystem: '系统代理', modeAppOnly: '应用内部', modePac: 'PAC 模式',
      appOnlySetup: '应用内部代理配置', pacSetup: 'PAC 代理配置', saveConfig: '保存配置', savePac: '保存到 PAC',
      localProxyStatus: '本地代理服务器状态', running: '运行中', stopped: '未运行', runningWithConnections: '运行中 · {0} 连接',
      listenAddress: '监听地址', currentConnections: '当前连接', upstreamTarget: '转发目标', totalConnections: '{0} / {1} 累计',
      activeClients: '当前连接的客户端', totalUpload: '总上传', totalDownload: '总下载', noActiveClients: '暂无客户端连接',
      allowLanSharing: '允许局域网共享', allowLanSharingHint: '启用后监听 0.0.0.0，局域网其他设备可连接',
      localAuth: '客户端认证', localAuthHint: '启用后客户端需提供用户名密码才能连接本代理', localAuthSaved: '客户端认证已保存', localAuthDisabled: '客户端认证已关闭',
      listenPort: '监听端口', random: '随机', randomPort: '随机生成端口', applyPort: '应用', listenPortHint: '留空=随机，修改后需重启代理生效',
      blockedIps: '目标 IP 封锁', blockedIpsHint: '封锁发往指定 IP 的流量，支持单个 IP 或 CIDR 网段。仅当目标地址为 IP 时生效，域名不影响。修改后即时生效。',
      blockedIpsHintBeforeSingle: '封锁发往指定 IP 的流量，支持单个 IP（如 ',
      blockedIpsHintBetweenExamples: '）或 CIDR 网段（如 ',
      blockedIpsHintAfterExamples: '）。仅当目标地址为 IP 时生效，域名不影响。修改后即时生效。',
      blockedIpPlaceholder: '输入 IP 或 CIDR，如 10.0.0.0/8', noBlockedIps: '暂无封锁 IP', blockedHeaderIp: 'IP 地址', blockedHeaderAction: '操作', removeBlockedTitle: '移除封锁',
      allowedIps: '中转代理白名单',
      allowedIpsHintBeforeSingle: '仅允许指定 IP 使用或访问应用内部中转代理，支持单个 IP（如 ',
      allowedIpsHintBetweenExamples: '）或 CIDR 网段（如 ',
      allowedIpsHintAfterExamples: '）。不能与黑名单同时启用；开启但列表为空时会拒绝所有连接。',
      allowedIpPlaceholder: '输入 IP 或 CIDR，如 192.168.1.0/24', noAllowedIps: '暂无白名单 IP', allowedHeaderIp: 'IP 地址', removeAllowedTitle: '移除白名单',
      rateIpPlaceholder: '客户端 IP 地址', rateUploadPlaceholder: '上传 KB/s', rateDownloadPlaceholder: '下载 KB/s',
      copyProxyAddress: '复制代理地址', restartProxy: '重启代理', stopLocalProxy: '停止本地代理', restarting: '重启中...',
      localProxyHintStopped: '应用内部代理在本机 127.0.0.1 监听。将代理地址配置到需要走代理的应用中即可使用，不会修改系统代理设置。',
      localProxyHintStoppedBefore: '应用内部代理在本机 ',
      localProxyHintStoppedAfter: ' 监听。将代理地址配置到需要走代理的应用中即可使用，不会修改系统代理设置。',
      localProxyHintShared: '代理在 0.0.0.0 监听，局域网内其他设备可使用 {0}:{1} 连接。',
      localProxyHintLocal: '代理仅在 127.0.0.1 监听，仅本机应用可连接。',
      sharingWillDisable: '共享已关闭，重启代理后生效。',
      sharingWillEnable: '共享已开启，重启代理后生效。',
      pacRulesConfig: 'PAC 规则配置', enablePac: '启用 PAC', pacEnabled: '已启用', pacDisabled: '已禁用',
      addRule: '添加规则', previewPac: '预览 PAC', noPacRules: '暂无规则，添加新规则或直接配置代理服务器后会自动创建默认规则。',
      domainPattern: '域名模式', domainPatternPlaceholder: '*.google.com, example.com, 或 * 表示全部',
      proxyTarget: '代理目标', proxyTargetPlaceholder: 'PROXY 127.0.0.1:7890 或 SOCKS5 ... 或 DIRECT',
      pacRuleHint: '提示：* 匹配所有域名，*.example.com 匹配子域名。代理格式：PROXY host:port、SOCKS5 host:port 或 DIRECT。',
      pacRuleHintPrefix: '提示：', pacRuleHintAll: ' 匹配所有域名，', pacRuleHintSubdomain: ' 匹配子域名。代理格式：',
      pacRuleHintSeparator: '、', pacRuleHintOr: ' 或 ',
      pacPreviewTitle: 'PAC 脚本预览', allTraffic: '全部流量', edit: '编辑',
      historyCleared: '配置历史已清除', switchModeFailed: '切换模式失败: {0}',
      lanSharingEnabled: '局域网共享已启用，重启代理后生效', lanSharingDisabled: '局域网共享已禁用', saveFailed: '保存失败: {0}',
      addressRequired: '请输入地址', portRequired: '请输入端口', desktopOnly: '仅在桌面应用中可用',
      testSuccessResult: '连接成功 ({0}ms)', proxyConnectivityOk: '代理连通性 OK ({0}ms)', proxyTestFailed: '代理测试失败',
      localProxyStartLog: '启动本地代理: {0}:{1} ({2})...', localProxyStarted: '本地代理已启动', localProxyStartFailed: '启动失败: {0}',
      testFirst: '请先测试连通性', applyPacLog: '应用 PAC', applySystemLog: '应用系统代理',
      pacApplied: 'PAC 配置已应用', proxyApplied: '代理已应用', disconnecting: '断开代理...', proxyDisconnected: '代理已断开', proxyActive: '代理已激活',
      ruleDeleted: '规则已删除', deleteFailed: '删除失败: {0}', pacRulesUpdated: 'PAC 规则已更新', pacRulesSaveFailed: '保存 PAC 规则失败: {0}',
      domainRequired: '请输入域名模式', proxyRequired: '请输入代理目标', ruleAddFailed: '添加规则失败: {0}', ruleSaved: '规则已保存',
      pacEnabledSnackbar: 'PAC 已启用', pacDisabledSnackbar: 'PAC 已禁用', operationFailed: '操作失败: {0}', pacContentFailed: '获取 PAC 内容失败',
      localProxyDesktopOnly: '代理检测仅在桌面应用中可用', localProxyNone: '未检测到本机正在运行的代理服务', detectFailed: '检测失败: {0}',
      filledProxy: '已填入 {0}:{1} ({2})', localProxyNotRunning: '本地代理未运行', copied: '已复制: {0}', copyFailed: '复制失败',
      localProxyStopped: '本地代理已停止', stopFailed: '停止失败: {0}', localProxyRestarted: '本地代理已重启', restartFailed: '重启失败: {0}',
      portAdminRequired: '端口 1024 以下需要管理员权限', listenPortSet: '监听端口已设为 {0}', listenPortRandomSet: '监听端口已设为随机',
      blockedIpsEnabled: '黑名单已启用', blockedIpsDisabled: '黑名单已关闭',
      allowedIpsEnabled: '白名单已启用，黑名单已自动关闭', allowedIpsDisabled: '白名单已关闭',
      blockedRemoved: '已移除封锁: {0}', removeFailed: '移除失败: {0}', blockedIpRequired: '请输入要封锁的 IP 地址', blockedAdded: '已添加封锁: {0}', addFailed: '添加失败',
      allowedRemoved: '已移除白名单: {0}', allowedIpRequired: '请输入要允许的 IP 地址', allowedAdded: '已添加白名单: {0}',
      poolEmpty: '代理池为空，请先添加代理', exportedJson: '已将 {0} 个代理导出为 JSON', exportedXml: '已将 {0} 个代理导出为 XML', exportedXlsx: '已将 {0} 个代理导出为 XLSX', exportFailed: '导出失败: {0}',
      ipRequired: 'IP 地址不能为空', rateLimitInvalid: '限速值必须为非负整数', ipRateAdded: 'IP 限速已添加: {0}', ipRateRemoved: '已移除 IP 限速: {0}', unknownError: '未知错误',
    },
  },
  zh_tw: {
    common: { unknown: '未知' },
    test: { fetchClipboard: '從剪貼簿取得' },
    config: {
      modeSystem: '系統代理', modeAppOnly: '應用內部', modePac: 'PAC 模式',
      appOnlySetup: '應用內部代理配置', pacSetup: 'PAC 代理配置', saveConfig: '儲存配置', savePac: '儲存到 PAC',
      localProxyStatus: '本地代理伺服器狀態', running: '執行中', stopped: '未執行', runningWithConnections: '執行中 · {0} 連線',
      listenAddress: '監聽地址', currentConnections: '目前連線', upstreamTarget: '轉發目標', totalConnections: '{0} / {1} 累計',
      activeClients: '目前連線的用戶端', totalUpload: '總上傳', totalDownload: '總下載', noActiveClients: '暫無用戶端連線',
      allowLanSharing: '允許區域網路分享', allowLanSharingHint: '啟用後監聽 0.0.0.0，區域網路其他裝置可連線',
      localAuth: '客戶端認證', localAuthHint: '啟用後客戶端需提供使用者名稱和密碼才能連接本代理', localAuthSaved: '客戶端認證已儲存', localAuthDisabled: '客戶端認證已關閉',
      listenPort: '監聽連接埠', random: '隨機', randomPort: '隨機產生連接埠', applyPort: '套用', listenPortHint: '留空=隨機，修改後需重啟代理生效',
      blockedIps: '目標 IP 封鎖', blockedIpsHint: '封鎖發往指定 IP 的流量，支援單一 IP 或 CIDR 網段。僅當目標地址為 IP 時生效，網域不受影響。修改後即時生效。',
      blockedIpsHintBeforeSingle: '封鎖發往指定 IP 的流量，支援單一 IP（如 ',
      blockedIpsHintBetweenExamples: '）或 CIDR 網段（如 ',
      blockedIpsHintAfterExamples: '）。僅當目標地址為 IP 時生效，網域不受影響。修改後即時生效。',
      blockedIpPlaceholder: '輸入 IP 或 CIDR，如 10.0.0.0/8', noBlockedIps: '暫無封鎖 IP', blockedHeaderIp: 'IP 地址', blockedHeaderAction: '操作', removeBlockedTitle: '移除封鎖',
      allowedIps: '中轉代理白名單',
      allowedIpsHintBeforeSingle: '僅允許指定 IP 使用或存取應用內部中轉代理，支援單一 IP（如 ',
      allowedIpsHintBetweenExamples: '）或 CIDR 網段（如 ',
      allowedIpsHintAfterExamples: '）。不能與黑名單同時啟用；啟用但清單為空時會拒絕所有連線。',
      allowedIpPlaceholder: '輸入 IP 或 CIDR，如 192.168.1.0/24', noAllowedIps: '暫無白名單 IP', allowedHeaderIp: 'IP 地址', removeAllowedTitle: '移除白名單',
      rateIpPlaceholder: '用戶端 IP 地址', rateUploadPlaceholder: '上傳 KB/s', rateDownloadPlaceholder: '下載 KB/s',
      copyProxyAddress: '複製代理地址', restartProxy: '重啟代理', stopLocalProxy: '停止本地代理', restarting: '重啟中...',
      localProxyHintStopped: '應用內部代理在本機 127.0.0.1 監聽。將代理地址配置到需要走代理的應用程式即可使用，不會修改系統代理設定。',
      localProxyHintStoppedBefore: '應用內部代理在本機 ',
      localProxyHintStoppedAfter: ' 監聽。將代理地址配置到需要走代理的應用程式即可使用，不會修改系統代理設定。',
      localProxyHintShared: '代理在 0.0.0.0 監聽，區域網路內其他裝置可使用 {0}:{1} 連線。',
      localProxyHintLocal: '代理僅在 127.0.0.1 監聽，僅本機應用程式可連線。',
      sharingWillDisable: '分享已關閉，重啟代理後生效。',
      sharingWillEnable: '分享已開啟，重啟代理後生效。',
      pacRulesConfig: 'PAC 規則配置', enablePac: '啟用 PAC', pacEnabled: '已啟用', pacDisabled: '已停用',
      addRule: '新增規則', previewPac: '預覽 PAC', noPacRules: '暫無規則，新增規則或直接配置代理伺服器後會自動建立預設規則。',
      domainPattern: '網域模式', domainPatternPlaceholder: '*.google.com, example.com，或 * 表示全部',
      proxyTarget: '代理目標', proxyTargetPlaceholder: 'PROXY 127.0.0.1:7890 或 SOCKS5 ... 或 DIRECT',
      pacRuleHint: '提示：* 匹配所有網域，*.example.com 匹配子網域。代理格式：PROXY host:port、SOCKS5 host:port 或 DIRECT。',
      pacRuleHintPrefix: '提示：', pacRuleHintAll: ' 匹配所有網域，', pacRuleHintSubdomain: ' 匹配子網域。代理格式：',
      pacRuleHintSeparator: '、', pacRuleHintOr: ' 或 ',
      pacPreviewTitle: 'PAC 腳本預覽', allTraffic: '全部流量', edit: '編輯',
      historyCleared: '配置歷史已清除', switchModeFailed: '切換模式失敗: {0}',
      lanSharingEnabled: '區域網路分享已啟用，重啟代理後生效', lanSharingDisabled: '區域網路分享已停用', saveFailed: '儲存失敗: {0}',
      addressRequired: '請輸入地址', portRequired: '請輸入連接埠', desktopOnly: '僅在桌面應用程式中可用',
      testSuccessResult: '連線成功 ({0}ms)', proxyConnectivityOk: '代理連通性 OK ({0}ms)', proxyTestFailed: '代理測試失敗',
      localProxyStartLog: '啟動本地代理: {0}:{1} ({2})...', localProxyStarted: '本地代理已啟動', localProxyStartFailed: '啟動失敗: {0}',
      testFirst: '請先測試連通性', applyPacLog: '套用 PAC', applySystemLog: '套用系統代理',
      pacApplied: 'PAC 配置已套用', proxyApplied: '代理已套用', disconnecting: '斷開代理...', proxyDisconnected: '代理已斷開', proxyActive: '代理已啟用',
      ruleDeleted: '規則已刪除', deleteFailed: '刪除失敗: {0}', pacRulesUpdated: 'PAC 規則已更新', pacRulesSaveFailed: '儲存 PAC 規則失敗: {0}',
      domainRequired: '請輸入網域模式', proxyRequired: '請輸入代理目標', ruleAddFailed: '新增規則失敗: {0}', ruleSaved: '規則已儲存',
      pacEnabledSnackbar: 'PAC 已啟用', pacDisabledSnackbar: 'PAC 已停用', operationFailed: '操作失敗: {0}', pacContentFailed: '取得 PAC 內容失敗',
      localProxyDesktopOnly: '代理檢測僅在桌面應用程式中可用', localProxyNone: '未檢測到本機正在執行的代理服務', detectFailed: '檢測失敗: {0}',
      filledProxy: '已填入 {0}:{1} ({2})', localProxyNotRunning: '本地代理未執行', copied: '已複製: {0}', copyFailed: '複製失敗',
      localProxyStopped: '本地代理已停止', stopFailed: '停止失敗: {0}', localProxyRestarted: '本地代理已重啟', restartFailed: '重啟失敗: {0}',
      portAdminRequired: '1024 以下連接埠需要管理員權限', listenPortSet: '監聽連接埠已設為 {0}', listenPortRandomSet: '監聽連接埠已設為隨機',
      blockedIpsEnabled: '黑名單已啟用', blockedIpsDisabled: '黑名單已關閉',
      allowedIpsEnabled: '白名單已啟用，黑名單已自動關閉', allowedIpsDisabled: '白名單已關閉',
      blockedRemoved: '已移除封鎖: {0}', removeFailed: '移除失敗: {0}', blockedIpRequired: '請輸入要封鎖的 IP 地址', blockedAdded: '已新增封鎖: {0}', addFailed: '新增失敗',
      allowedRemoved: '已移除白名單: {0}', allowedIpRequired: '請輸入要允許的 IP 地址', allowedAdded: '已新增白名單: {0}',
      poolEmpty: '代理池為空，請先新增代理', exportedJson: '已將 {0} 個代理匯出為 JSON', exportedXml: '已將 {0} 個代理匯出為 XML', exportedXlsx: '已將 {0} 個代理匯出為 XLSX', exportFailed: '匯出失敗: {0}',
      ipRequired: 'IP 地址不能為空', rateLimitInvalid: '限速值必須為非負整數', ipRateAdded: 'IP 限速已新增: {0}', ipRateRemoved: '已移除 IP 限速: {0}', unknownError: '未知錯誤',
    },
  },
  ja: {
    common: { unknown: '不明' },
    test: { fetchClipboard: 'クリップボードから取得' },
    config: {
      modeSystem: 'システムプロキシ', modeAppOnly: 'アプリ内部', modePac: 'PAC モード',
      appOnlySetup: 'アプリ内部プロキシ設定', pacSetup: 'PAC プロキシ設定', saveConfig: '設定を保存', savePac: 'PAC に保存',
      localProxyStatus: 'ローカルプロキシサーバー状態', running: '実行中', stopped: '停止中', runningWithConnections: '実行中 · {0} 接続',
      listenAddress: 'リッスンアドレス', currentConnections: '現在の接続', upstreamTarget: '転送先', totalConnections: '{0} / {1} 累計',
      activeClients: '接続中のクライアント', totalUpload: '総アップロード', totalDownload: '総ダウンロード', noActiveClients: '接続中のクライアントはありません',
      allowLanSharing: 'LAN 共有を許可', allowLanSharingHint: '0.0.0.0 でリッスンし、LAN 内の他デバイスが接続できます',
      localAuth: 'クライアント認証', localAuthHint: '有効にすると、クライアントは接続時にユーザー名とパスワードを入力する必要があります', localAuthSaved: 'クライアント認証を保存しました', localAuthDisabled: 'クライアント認証を無効にしました',
      listenPort: 'リッスンポート', random: 'ランダム', randomPort: 'ランダムポートを生成', applyPort: '適用', listenPortHint: '空欄=ランダム。変更後はプロキシ再起動で反映。',
      blockedIps: 'ターゲット IP ブロック', blockedIpsHint: '指定 IP への通信をブロックします。単一 IP または CIDR をサポートします。対象が IP の場合のみ有効で、ドメインには影響しません。変更は即時反映されます。',
      blockedIpsHintBeforeSingle: '指定 IP への通信をブロックします。単一 IP（例: ',
      blockedIpsHintBetweenExamples: '）または CIDR（例: ',
      blockedIpsHintAfterExamples: '）をサポートします。対象が IP の場合のみ有効で、ドメインには影響しません。変更は即時反映されます。',
      blockedIpPlaceholder: 'IP または CIDR、例: 10.0.0.0/8', noBlockedIps: 'ブロック IP はありません', blockedHeaderIp: 'IP アドレス', blockedHeaderAction: '操作', removeBlockedTitle: 'ブロックを解除',
      allowedIps: 'リレープロキシ許可リスト',
      allowedIpsHintBeforeSingle: '指定した IP のみアプリ内部リレープロキシの利用またはアクセスを許可します。単一 IP（例: ',
      allowedIpsHintBetweenExamples: '）または CIDR（例: ',
      allowedIpsHintAfterExamples: '）をサポートします。ブロックリストと同時に有効化できません。有効でリストが空の場合、すべての接続を拒否します。',
      allowedIpPlaceholder: 'IP または CIDR、例: 192.168.1.0/24', noAllowedIps: '許可 IP はありません', allowedHeaderIp: 'IP アドレス', removeAllowedTitle: '許可を解除',
      rateIpPlaceholder: 'クライアント IP アドレス', rateUploadPlaceholder: 'アップロード KB/s', rateDownloadPlaceholder: 'ダウンロード KB/s',
      copyProxyAddress: 'プロキシアドレスをコピー', restartProxy: 'プロキシ再起動', stopLocalProxy: 'ローカルプロキシ停止', restarting: '再起動中...',
      localProxyHintStopped: 'アプリ内部プロキシはこの端末の 127.0.0.1 でリッスンします。プロキシを使うアプリにこのアドレスを設定してください。システムプロキシ設定は変更されません。',
      localProxyHintStoppedBefore: 'アプリ内部プロキシはこの端末の ',
      localProxyHintStoppedAfter: ' でリッスンします。プロキシを使うアプリにこのアドレスを設定してください。システムプロキシ設定は変更されません。',
      localProxyHintShared: 'プロキシは 0.0.0.0 でリッスンしています。LAN 内の他デバイスは {0}:{1} で接続できます。',
      localProxyHintLocal: 'プロキシは 127.0.0.1 のみでリッスンし、この端末だけで利用できます。',
      sharingWillDisable: '共有はオフです。プロキシ再起動後に反映されます。',
      sharingWillEnable: '共有はオンです。プロキシ再起動後に反映されます。',
      pacRulesConfig: 'PAC ルール設定', enablePac: 'PAC を有効化', pacEnabled: '有効', pacDisabled: '無効',
      addRule: 'ルール追加', previewPac: 'PAC プレビュー', noPacRules: 'ルールがありません。ルールを追加するかプロキシサーバーを設定するとデフォルトルールが自動作成されます。',
      domainPattern: 'ドメインパターン', domainPatternPlaceholder: '*.google.com、example.com、または * ですべて',
      proxyTarget: 'プロキシ対象', proxyTargetPlaceholder: 'PROXY 127.0.0.1:7890、SOCKS5 ...、または DIRECT',
      pacRuleHint: 'ヒント: * はすべてのドメイン、*.example.com はサブドメインに一致します。形式: PROXY host:port、SOCKS5 host:port、DIRECT。',
      pacRuleHintPrefix: 'ヒント: ', pacRuleHintAll: ' はすべてのドメインに一致し、', pacRuleHintSubdomain: ' はサブドメインに一致します。形式: ',
      pacRuleHintSeparator: '、', pacRuleHintOr: '、',
      pacPreviewTitle: 'PAC スクリプトプレビュー', allTraffic: 'すべての通信', edit: '編集',
      historyCleared: '設定履歴を消去しました', switchModeFailed: 'モード切替に失敗: {0}',
      lanSharingEnabled: 'LAN 共有を有効化しました。プロキシ再起動後に反映されます。', lanSharingDisabled: 'LAN 共有を無効化しました', saveFailed: '保存に失敗: {0}',
      addressRequired: 'アドレスを入力してください', portRequired: 'ポートを入力してください', desktopOnly: 'デスクトップアプリでのみ利用できます',
      testSuccessResult: '接続成功 ({0}ms)', proxyConnectivityOk: 'プロキシ接続 OK ({0}ms)', proxyTestFailed: 'プロキシテスト失敗',
      localProxyStartLog: 'ローカルプロキシ起動: {0}:{1} ({2})...', localProxyStarted: 'ローカルプロキシを起動しました', localProxyStartFailed: '起動失敗: {0}',
      testFirst: '先に接続テストを実行してください', applyPacLog: 'PAC を適用', applySystemLog: 'システムプロキシを適用',
      pacApplied: 'PAC 設定を適用しました', proxyApplied: 'プロキシを適用しました', disconnecting: 'プロキシを切断中...', proxyDisconnected: 'プロキシを切断しました', proxyActive: 'プロキシは有効です',
      ruleDeleted: 'ルールを削除しました', deleteFailed: '削除失敗: {0}', pacRulesUpdated: 'PAC ルールを更新しました', pacRulesSaveFailed: 'PAC ルール保存失敗: {0}',
      domainRequired: 'ドメインパターンを入力してください', proxyRequired: 'プロキシ対象を入力してください', ruleAddFailed: 'ルール追加失敗: {0}', ruleSaved: 'ルールを保存しました',
      pacEnabledSnackbar: 'PAC を有効化しました', pacDisabledSnackbar: 'PAC を無効化しました', operationFailed: '操作失敗: {0}', pacContentFailed: 'PAC 内容の取得に失敗しました',
      localProxyDesktopOnly: 'プロキシ検出はデスクトップアプリでのみ利用できます', localProxyNone: '実行中のローカルプロキシサービスは見つかりません', detectFailed: '検出失敗: {0}',
      filledProxy: '{0}:{1} ({2}) を入力しました', localProxyNotRunning: 'ローカルプロキシは実行されていません', copied: 'コピーしました: {0}', copyFailed: 'コピー失敗',
      localProxyStopped: 'ローカルプロキシを停止しました', stopFailed: '停止失敗: {0}', localProxyRestarted: 'ローカルプロキシを再起動しました', restartFailed: '再起動失敗: {0}',
      portAdminRequired: '1024 未満のポートには管理者権限が必要です', listenPortSet: 'リッスンポートを {0} に設定しました', listenPortRandomSet: 'リッスンポートをランダムに設定しました',
      blockedIpsEnabled: 'ブロックリストを有効化しました', blockedIpsDisabled: 'ブロックリストを無効化しました',
      allowedIpsEnabled: '許可リストを有効化しました。ブロックリストは自動的に無効化されました', allowedIpsDisabled: '許可リストを無効化しました',
      blockedRemoved: 'ブロック解除: {0}', removeFailed: '解除失敗: {0}', blockedIpRequired: 'ブロックする IP アドレスを入力してください', blockedAdded: 'ブロック追加: {0}', addFailed: '追加失敗',
      allowedRemoved: '許可を解除しました: {0}', allowedIpRequired: '許可する IP アドレスを入力してください', allowedAdded: '許可しました: {0}',
      poolEmpty: 'プロキシプールが空です。先にプロキシを追加してください', exportedJson: '{0} 件のプロキシを JSON としてエクスポートしました', exportedXml: '{0} 件のプロキシを XML としてエクスポートしました', exportedXlsx: '{0} 件のプロキシを XLSX としてエクスポートしました', exportFailed: 'エクスポート失敗: {0}',
      ipRequired: 'IP アドレスは空にできません', rateLimitInvalid: '制限値は 0 以上の整数である必要があります', ipRateAdded: 'IP 帯域制限を追加しました: {0}', ipRateRemoved: 'IP 帯域制限を削除しました: {0}', unknownError: '不明なエラー',
    },
  },
};

function mergeLocale(target, source) {
  Object.keys(source).forEach(function(key) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = target[key] || {};
      mergeLocale(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  });
}

Object.keys(EXTRA_LOCALE).forEach(function(lang) {
  mergeLocale(LOCALE[lang], EXTRA_LOCALE[lang]);
});

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
