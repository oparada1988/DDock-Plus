UUID = ddock-plus@oparada1988.github.com
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
SYSTEM_SCHEMA_DIR = $(HOME)/.local/share/glib-2.0/schemas

all: build

build:
	@echo "Building DDock-Plus..."
	glib-compile-schemas schemas/

install: build
	@echo "Installing to $(EXT_DIR)..."
	mkdir -p $(EXT_DIR)
	cp -r metadata.json extension.js prefs.js stylesheet.css modules schemas $(EXT_DIR)/
	mkdir -p $(SYSTEM_SCHEMA_DIR)
	cp schemas/org.gnome.shell.extensions.ddock-plus.gschema.xml $(SYSTEM_SCHEMA_DIR)/
	glib-compile-schemas $(SYSTEM_SCHEMA_DIR)/
	@echo "Installed successfully and recompiled schemas."

clean:
	rm -rf $(EXT_DIR)

.PHONY: all build install clean

