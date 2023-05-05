{
  description = "Webb Orbit development environment";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "orbit";
          nativeBuildInputs = [ ];
          buildInputs = [
            # Used for DVC
            pkgs.python311
            pkgs.python311Packages.pipx
            # Nodejs
            pkgs.nodePackages.typescript-language-server
            pkgs.nodejs_18
            pkgs.nodePackages.yarn
          ];
          packages = [ ];
          # Runs DVC pull in the fixtures
          # we do not install dvc globally, since it
          # is broken on nixos
          shellHook = ''
            ROOT=$(git rev-parse --show-toplevel)
            cd $ROOT/deploy/fixtures
            # Pull fixtures
            pipx run dvc pull
            cd $ROOT
          '';
        };
      });
}
