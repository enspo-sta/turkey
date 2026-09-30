import UIKit
import WebKit

/// Hosts the game (the single-file web build in the bundled `dist` folder) in a
/// full-screen WebKit view, bridges haptic feedback to the Taptic Engine and
/// keeps a native copy of the save game.
final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    /// Web storage keys the game writes (see src/gameplay/state.js).
    private static let storedKeys = ["rubenHotrodFishing.save.v1", "rubenHotrodFishing.settings.v1"]

    private var webView: WKWebView!
    private let lightImpact = UIImpactFeedbackGenerator(style: .light)
    private let mediumImpact = UIImpactFeedbackGenerator(style: .medium)
    private let heavyImpact = UIImpactFeedbackGenerator(style: .heavy)
    private let notification = UINotificationFeedbackGenerator()

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let handler = WeakScriptMessageHandler(self)
        config.userContentController.add(handler, name: "haptic")
        config.userContentController.add(handler, name: "store")
        if let restore = Self.restoreScript() {
            config.userContentController.addUserScript(restore)
        }

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = true
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) {
            // Lets Safari's Web Inspector attach to debug builds.
            webView.isInspectable = true
        }
        #endif
        self.webView = webView
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") else {
            fatalError("dist/index.html is missing from the app bundle. Run `npm run build` in the repository root, then build again.")
        }
        webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        lightImpact.prepare()
        heavyImpact.prepare()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    // Swipes that start at the screen edges steer the game first; a second
    // swipe still reaches the system.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    /// Copies the native save back into web storage before the game starts,
    /// in case WebKit's own storage was cleared.
    private static func restoreScript() -> WKUserScript? {
        var source = ""
        for key in storedKeys {
            guard let value = UserDefaults.standard.string(forKey: "web." + key),
                  let data = try? JSONSerialization.data(withJSONObject: [key, value]),
                  let pair = String(data: data, encoding: .utf8) else { continue }
            source += "try { var p = \(pair); localStorage.setItem(p[0], p[1]); } catch (e) {}\n"
        }
        guard !source.isEmpty else { return nil }
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "haptic":
            switch message.body as? String {
            case "heavy":
                heavyImpact.impactOccurred()
                heavyImpact.prepare()
            case "medium":
                mediumImpact.impactOccurred()
            case "success":
                notification.notificationOccurred(.success)
            default:
                lightImpact.impactOccurred(intensity: 0.7)
                lightImpact.prepare()
            }
        case "store":
            guard let body = message.body as? [String: Any],
                  let key = body["key"] as? String,
                  Self.storedKeys.contains(key) else { return }
            if let value = body["value"] as? String {
                UserDefaults.standard.set(value, forKey: "web." + key)
            } else {
                UserDefaults.standard.removeObject(forKey: "web." + key)
            }
        default:
            break
        }
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Links to websites (credits, licences) open in Safari instead of replacing the game.
        if let url = navigationAction.request.url, url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Links that ask for a new window (target="_blank") open in Safari.
        if let url = navigationAction.request.url, url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS may reclaim the web content process while the app is in the
        // background; progress is saved on every pause, so just reload.
        webView.reload()
    }
}

/// Breaks the retain cycle between WKUserContentController and its handler.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
