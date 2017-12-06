with (import <nixpkgs> {});

buildEnv {
  name = "messageport-observable-build-env";
  paths = [ nodejs nodePackages.yarn ];
}
