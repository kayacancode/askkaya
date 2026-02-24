class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.1.9"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.9/askkaya-darwin-arm64"
      sha256 "88f739dd19b31e991f3dd0a3bce43f7b41cb951932edb8f362ce97e6e673357d"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.9/askkaya-darwin-amd64"
      sha256 "8ee1a584ffc9bff03cf8be5aa0673d11270314ed19aa0b18c60bd5bc9cc0910c"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.9/askkaya-linux-arm64"
      sha256 "2f73490758761533f666796d1db555d1615fe4625fd351dbaa57cf1cab4baddf"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.9/askkaya-linux-amd64"
      sha256 "29ca7631eeef1f149ce0fde41686daf59bd18ce9ad90d04fe219cc09d5c48f4d"
    end
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "askkaya-darwin-arm64" => "askkaya"
      else
        bin.install "askkaya-darwin-amd64" => "askkaya"
      end
    elsif OS.linux?
      if Hardware::CPU.arm?
        bin.install "askkaya-linux-arm64" => "askkaya"
      else
        bin.install "askkaya-linux-amd64" => "askkaya"
      end
    end
  end

  test do
    system "#{bin}/askkaya", "--version"
  end
end
