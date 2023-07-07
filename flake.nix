{
  description = "Webb Orbit development environment";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    foundry = {
      url = "github:shazow/foundry.nix";
      inputs = {
        nixpkgs.follows = "nixpkgs";
        flake-utils.follows = "flake-utils";
      };
    };
  };

  outputs = { self, nixpkgs, flake-utils, foundry }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ foundry.overlay ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "orbit";
          nativeBuildInputs = [ ];
          buildInputs = [
            # Nodejs
            pkgs.nodePackages.typescript-language-server
            pkgs.nodejs_18
            pkgs.nodePackages.yarn
            pkgs.foundry-bin
          ];
          packages = [ ];
        };
      });
}
