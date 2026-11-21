// theID's presence helper: a P-256 key in this device's Secure Enclave, used only while the person is there (Touch
// ID, or the login password). It locks the owner's key: the key is sealed to the Enclave key's public half (in Rust,
// src/presence.rs), and opening it needs the Enclave's agreement, which asks the person. Run by theID, never by hand.
//
//     theOS make                one key: its blob (base64), then its public key (SEC1, hex)
//     theOS agree <reason>      input: the blob, then a public key (SEC1, hex); out: the shared secret (hex). The
//                               system asks the person, showing "<reason>".
//     theOS make-test           a key that asks nobody, for theID's own tests
import CryptoKit
import Foundation
import LocalAuthentication

func fail(_ s: String) -> Never {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
    exit(1)
}

func hex<D: DataProtocol>(_ d: D) -> String { d.map { String(format: "%02x", $0) }.joined() }

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

func make(_ flags: SecAccessControlCreateFlags) {
    guard SecureEnclave.isAvailable else { fail("this device has no Secure Enclave") }
    // usable only on this device, only while it is unlocked, and (with .userPresence) each use only with the person
    guard let ac = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, flags, nil) else {
        fail("no access control")
    }
    do {
        let k = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: ac)
        print(k.dataRepresentation.base64EncodedString())
        print(hex(k.publicKey.x963Representation))
    } catch { fail("no key made: \(error.localizedDescription)") }
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "make" where args.count == 2:
    make([.privateKeyUsage, .userPresence])
case "make-test" where args.count == 2:
    make([.privateKeyUsage])
case "agree" where args.count == 3:
    let input = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let lines = input.split(separator: "\n")
    guard lines.count == 2, let blob = Data(base64Encoded: String(lines[0])), let theirs = unhex(lines[1]) else {
        fail("input: the key's blob, then a public key in hex")
    }
    let context = LAContext()
    context.localizedReason = args[2]
    do {
        let k = try SecureEnclave.P256.KeyAgreement.PrivateKey(dataRepresentation: blob, authenticationContext: context)
        let other = try P256.KeyAgreement.PublicKey(x963Representation: theirs)
        let shared = try k.sharedSecretFromKeyAgreement(with: other)
        print(shared.withUnsafeBytes { hex(Data($0)) })
    } catch { fail("not opened: \(error.localizedDescription)") }
default:
    fail("theOS make | theOS agree <reason> | theOS make-test")
}
