import Foundation
import Darwin

/// Same-user Unix socket. Session data lives in memory and the keychain only.
struct HubDesktopSessionBridge: HubDesktopSessionSharing {
    let directory: String
    init(directory: String = "/tmp/moonlight-hub-\(getuid())") { self.directory = directory }

    func read(origin: String) async -> HubDesktopSession? {
        await exchange(action: "read", session: nil, origin: origin)
    }

    func write(_ session: HubSavedSession?, origin: String) async {
        _ = await exchange(action: "write", session: session, origin: origin)
    }

    private func exchange(action: String, session: HubSavedSession?, origin: String) async -> HubDesktopSession? {
        await Task.detached(priority: .utility) {
            var info = stat()
            guard lstat(directory, &info) == 0, info.st_uid == getuid(),
                  info.st_mode & S_IFMT == S_IFDIR, info.st_mode & 0o777 == 0o700 else { return nil }
            let socketPath = directory + "/session.sock"
            guard lstat(socketPath, &info) == 0, info.st_uid == getuid(),
                  info.st_mode & S_IFMT == S_IFSOCK, info.st_mode & 0o777 == 0o600 else { return nil }
            let fd = socket(AF_UNIX, SOCK_STREAM, 0)
            guard fd >= 0 else { return nil }
            defer { close(fd) }
            var timeout = timeval(tv_sec: 1, tv_usec: 0)
            var noSignal: Int32 = 1
            setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
            setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
            setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
            var address = sockaddr_un()
            address.sun_family = sa_family_t(AF_UNIX)
            let bytes = socketPath.utf8CString
            guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { return nil }
            withUnsafeMutableBytes(of: &address.sun_path) { target in
                bytes.withUnsafeBytes { source in target.copyBytes(from: source) }
            }
            let size = socklen_t(MemoryLayout<sockaddr_un>.size)
            let connected = withUnsafePointer(to: &address) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, size) }
            }
            var peerUID: uid_t = 0; var peerGID: gid_t = 0
            guard connected == 0, getpeereid(fd, &peerUID, &peerGID) == 0, peerUID == getuid() else { return nil }
            var request: [String: Any] = ["action": action, "origin": origin, "session": NSNull()]
            if let session { request["session"] = ["value": session.value, "expiresAt": session.expiresAt] }
            guard var data = try? JSONSerialization.data(withJSONObject: request) else { return nil }
            data.append(0x0a)
            let sent = data.withUnsafeBytes { Darwin.send(fd, $0.baseAddress, $0.count, 0) }
            guard sent == data.count else { return nil }
            var received = Data()
            var chunk = [UInt8](repeating: 0, count: 4096)
            while received.count <= 8192 {
                let count = recv(fd, &chunk, chunk.count, 0)
                guard count > 0 else { return nil }
                received.append(contentsOf: chunk.prefix(count))
                if let newline = received.firstIndex(of: 0x0a) {
                    guard let shared = try? JSONDecoder().decode(HubDesktopSession.self, from: received.prefix(upTo: newline)),
                          shared.origin == origin else { return nil }
                    return shared
                }
            }
            return nil
        }.value
    }
}
