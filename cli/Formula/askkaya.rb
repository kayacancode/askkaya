class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.2.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-darwin-arm64"
      sha256 "af02caece6700884e6f5d77aba79a20d1eec2f49dffc85a29ee15ad70ffb46c2"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-darwin-amd64"
      sha256 "522d29066d7a3d85bb3e26f0439cf37cd5ecb7e3ef1ff89c8bf007dac1ecdf78"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-linux-arm64"
      sha256 "aa1256b46cc392f12c036ebf177af7e3edb60e0dc7ab6fa405657e559a71a511"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-linux-amd64"
      sha256 "73f4437b8a7c484f9fd09e60eabb23bcb9442553e4a93bb7a933b67f4ab4bb4e"
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
