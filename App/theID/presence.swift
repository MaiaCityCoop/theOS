// theID's presence helper: a P-256 key in this Mac's Secure Enclave that signs only while a person is there (Touch ID,
// or the login password). Run by theID (src/presence.rs), never by hand. The key's blob is useless on any other Mac,
// and on this one without the person.
//
//     theOS make                one key: its blob (base64), then its public key (SEC1, hex)
//     theOS sign <reason>       input: the blob, then the message (hex); out: the signature (64 bytes, hex). The
//                               system asks the person, showing "<reason>".
//     theOS test                a throwaway key that asks nobody: its public key, then 16 lines "message signature"
//                               (theID's test that the Enclave's signatures check in Rust)
import CryptoKit
import Foundation
import LocalAuthentication

func fail(_ s: String) -> Never {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
    exit(1)
}

func hex(_ d: Data) -> String { d.map { String(format: "%02x", $0) }.joined() }

func unhex(_ s: Substring) -> Data? {
    var d = Data()
    var i = s.startIndex
    while i < s.endIndex {
        let j = s.index(i, offsetBy: 2, limitedBy: s.endIndex) ?? s.endIndex
        guard let b = UInt8(s[i..<j], radix: 16) else { return nil }
        d.append(b)
        i = j
    }
    return d
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "make" where args.count == 2:
    guard SecureEnclave.isAvailable else { fail("this Mac has no Secure Enclave") }
    // usable only on this Mac, only while it is unlocked, and each use only with the person there
    guard let ac = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage, .userPresence], nil) else {
        fail("no access control")
    }
    do {
        let k = try SecureEnclave.P256.Signing.PrivateKey(accessControl: ac)
        print(k.dataRepresentation.base64EncodedString())
        print(hex(k.publicKey.x963Representation))
    } catch { fail("no key made: \(error.localizedDescription)") }
case "sign" where args.count == 3:
    let input = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let lines = input.split(separator: "\n")
    guard lines.count == 2, let blob = Data(base64Encoded: String(lines[0])), let message = unhex(lines[1]) else {
        fail("input: the key's blob, then the message in hex")
    }
    let context = LAContext()
    context.localizedReason = args[2]
    do {
        let k = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob, authenticationContext: context)
        print(hex(try k.signature(for: message).rawRepresentation))
    } catch { fail("not signed: \(error.localizedDescription)") }
case "test" where args.count == 2:
    guard let ac = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage], nil),
          let k = try? SecureEnclave.P256.Signing.PrivateKey(accessControl: ac) else { fail("no Secure Enclave") }
    print(hex(k.publicKey.x963Representation))
    for i in 0..<16 {
        let m = Data("theOS test \(i) \(UUID())".utf8)
        guard let s = try? k.signature(for: m) else { fail("not signed") }
        print(hex(m) + " " + hex(s.rawRepresentation))
    }
default:
    fail("theOS make | theOS sign <reason> | theOS test")
}
