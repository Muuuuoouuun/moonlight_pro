import Foundation

// Shell shortcuts only select an existing surface. URLs never carry draft text,
// credentials, or commands that save data.
enum PetCommand: String {
    case memo, tasks

    init?(url: URL) {
        guard url.scheme == "moonlight-pet", url.user == nil, url.password == nil,
              url.port == nil, url.path.isEmpty || url.path == "/",
              url.query == nil, url.fragment == nil, let host = url.host else { return nil }
        self.init(rawValue: host)
    }
}
