
schemas:
	glib-compile-schemas dict@sun.wxg@gmail.com/schemas/
submit: schemas
	cd dict@sun.wxg@gmail.com/ && zip -r ~/dict.zip *

install:
	rm -rf ~/.local/share/gnome-shell/extensions/dict@sun.wxg@gmail.com
	cp -r dict@sun.wxg@gmail.com ~/.local/share/gnome-shell/extensions/

