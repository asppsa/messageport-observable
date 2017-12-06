with (import <nixpkgs> {});

let messageport-observable-build-env = import ./default.nix;
in stdenv.mkDerivation {
  name = "messageport-observable-shell-env";
  buildInputs = [ messageport-observable-build-env ];

  TERMINFO = "/usr/share/terminfo";

  shellHook = ''
    export PATH=$(pwd)/node_modules/.bin:$PATH
  '';
}
