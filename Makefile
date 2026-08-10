UUID = ddock-plus@oparada1988.github.com
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

all: build

build:
	@echo "Building DDock-Plus..."
	glib-compile-schemas schemas/

install: build
	@echo "Installing to $(EXT_DIR)..."
	mkdir -p $(EXT_DIR)
	cp -r metadata.json extension.js prefs.js stylesheet.css modules schemas $(EXT_DIR)/
	@echo "Installed successfully."

clean:
	rm -rf $(EXT_DIR)

.PHONY: all build install clean
