/*
 * @Dieg0Js - 2023
 * https://github.com/Dieg0Js/gnome-downloads-indicator
 *
 * Fork of Gnome Trash from Axel von Bertoldi
 * https://gitlab.com/bertoldia/gnome-shell-trash-extension
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, write to:
 * The Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor
 * Boston, MA 02110-1301, USA.
 */

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const ModalDialog = imports.ui.modalDialog;
const Clutter = imports.gi.Clutter;
const Gettext = imports.gettext.domain("downloads_indicator");
const _ = Gettext.gettext;
const { St, GObject, Gio, GLib } = imports.gi;

const ScrollableMenu = class ScrollableMenu extends PopupMenu.PopupMenuSection {
  constructor() {
    super();
    let scrollView = new St.ScrollView({
      y_align: St.Align.START,
      overlay_scrollbars: true,
      style_class: 'vfade'
    });
    this.innerMenu = new PopupMenu.PopupMenuSection();
    scrollView.add_actor(this.innerMenu.actor);
    this.actor.add_actor(scrollView);
  }

  addMenuItem(item) {
    this.innerMenu.addMenuItem(item);
  }

  removeAll() {
    this.innerMenu.removeAll();
  }
};


const ActionBar = GObject.registerClass(
class ActionBar extends PopupMenu.PopupBaseMenuItem {
    constructor(openFolderCallback, emptyFolderCallback) {
      super({
          reactive: false,
          activate: false,
          hover: false,
          can_focus: false,
          style_class: 'action-bar',
      });
      let actionsBox = new St.BoxLayout({
          vertical: false,
          hover: false,
          can_focus: false,
      });

      //OPEN BUTTON

      this._openBtn = new PopupMenu.PopupBaseMenuItem({
        style_class: 'action-bar-btn'
    });
    // let openFolderIcon = new St.Icon({
    //     icon_name: "folder-open-symbolic",
    //     style_class: 'popup-menu-icon',
    // });
    // this._openBtn.add_child(openFolderIcon);
    let openLbl = new St.Label({ text: _("Open") });
      this._openBtn.add_child(openLbl);
    this._openBtn._ornamentLabel.visible = false;
    this._openBtn.connect('activate', openFolderCallback);

    actionsBox.add(this._openBtn);
    this.actor.add_actor(actionsBox);

      //CLEAR BUTTON

      this._clearBtn = new PopupMenu.PopupBaseMenuItem({
          style_class: 'action-bar-btn'
      });
      // let clearIcon = new St.Icon({
      //     icon_name: "edit-delete-symbolic",
      //     style_class: 'popup-menu-icon',
      // });
      // this._clearBtn.add_child(clearIcon);
      let clearLbl = new St.Label({ text: _("Empty") });
        this._clearBtn.add_child(clearLbl);
      this._clearBtn._ornamentLabel.visible = false;
      this._clearBtn.connect('activate', emptyFolderCallback);
      actionsBox.add(this._clearBtn);
      
    }
  }
);

const DownloadsMenuItem = GObject.registerClass(
  class DownloadsMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(text, icon_name, gicon, onActivate, onIconPress) {
      super._init(0.0, text);

      let icon_cfg = { style_class: 'popup-menu-icon' };
      if (icon_name != null) {
        icon_cfg.icon_name = icon_name;
      } else if (gicon != null) {
        icon_cfg.gicon = gicon;
      }

      this.icon = new St.Icon(icon_cfg);
      this.actor.add_child(this.icon);
      this.label = new St.Label({ text: text });
      this.actor.add_child(this.label);

      this.connect('activate', onActivate);

      let removeIcon = new St.Icon({
        icon_name: "window-close-symbolic",
        style_class: 'popup-menu-icon'
    });
    let removeBtn = new St.Button({
        style_class: 'action-btn',
        child: removeIcon
    });
    removeBtn.set_x_align(Clutter.ActorAlign.END);
    removeBtn.set_x_expand(true);
    removeBtn.set_y_expand(true);
    this.actor.add_child(removeBtn);
    removeBtn.connect('button-press-event', onIconPress);
    }

    destroy() {
      super.destroy();
    }
  });

const DownloadsMenu = GObject.registerClass(
  class DownloadsMenu extends PanelMenu.Button {
    _init() {
      super._init(0.0, _("Downloads"));
      this.downloadsIcon = new St.Icon({
        icon_name: 'folder-download-symbolic',
        style_class: 'popup-menu-icon'
      })
      this.add_actor(this.downloadsIcon);

      // If this fails, see workaround in https://bugs.archlinux.org/task/62860
      let _downloads_path = GLib.get_home_dir() + '/Downloads/';
      this.download_folder = Gio.file_new_for_uri('file:///' + _downloads_path);
 
      this._addConstMenuItems(); 
      this._onDownloadsChange();
      this._setupWatch();
    }

    _addConstMenuItems() {

      this.filesList = new ScrollableMenu();
      this.menu.addMenuItem(this.filesList);

      this.separator = new PopupMenu.PopupSeparatorMenuItem();
      this.menu.addMenuItem(this.separator); 

      this.actionBar = new ActionBar(
        this._onOpenDownloads.bind(this),
        this._onEmptyDownloads.bind(this));
      this.menu.addMenuItem(this.actionBar);    
    }

    destroy() {
      super.destroy();
    }

    _onOpenDownloads() {
      Gio.app_info_launch_default_for_uri(this.download_folder.get_uri(), null);
    }

    _setupWatch() {
      this.monitor = this.download_folder.monitor_directory(0, null);
      this.monitor.connect('changed', this._onDownloadsChange.bind(this));
    }

    _onDownloadsChange() {
      this._clearMenu();
      if (this._listFilesInDownloads() == 0) {
        this.visible = false;
      } else {
        this.show();
        this.visible = true;
      }
    }

    _onEmptyDownloads() {
      new InteractiveDialog(
        "Empty Downloads?",
        "All the downloads are going to be trashed",
        this._doEmptyDownloads.bind(this)
      ).open();
    }

    _doEmptyDownloads() {
      let children = this.download_folder.enumerate_children('*', 0, null);
      let child_info = null;
      while ((child_info = children.next_file(null)) != null) {
        let child = this.download_folder.get_child(child_info.get_name());     
        child.trash(null);
      }
    }

    _onDeleteSingleDownload(file_name) {
      this.file_name = file_name;
      new InteractiveDialog(
        "Delete " + file_name + " ?",
        "The file is going to be trashed",
        this._doDeleteSingleDownload.bind(this)
      ).open();
    }

    _doDeleteSingleDownload() {
      let child = this.download_folder.get_child(this.file_name);     
        child.trash(null);
    }

    _listFilesInDownloads() {
      let children = this.download_folder.enumerate_children('*', 0, null);
      let count = 0;
      let child_info = null;
      while ((child_info = children.next_file(null)) != null) {
        let file_name = child_info.get_name();
        let item = new DownloadsMenuItem(child_info.get_display_name(),
          null,
          child_info.get_symbolic_icon(),
          () => {
            this._openDownloadsItem(file_name);
          },
          () => {
            this._onDeleteSingleDownload(file_name);
          });
          
        this.filesList.addMenuItem(item);
        count++;
      }
      children.close(null)     
      return count;
    }

    _clearMenu() {
      this.filesList.removeAll();
    }

    _openDownloadsItem(file_name) {
      let file = this.download_folder.get_child(file_name);
      Gio.app_info_launch_default_for_uri(file.get_uri(), null);
      this.menu.close();
    }
  });

  var InteractiveDialog = GObject.registerClass(
    class InteractiveDialogView extends ModalDialog.ModalDialog {
      _init(title, description, action) {
        super._init({ styleClass: null });
  
        let mainContentBox = new St.BoxLayout({
          style_class: `polkit-dialog-main-layout`,
          vertical: false
        });
        this.contentLayout.add_child(mainContentBox/*, { x_fill: true, y_fill: true }*/);
  
        let messageBox = new St.BoxLayout({
          style_class: `polkit-dialog-message-layout`,
          vertical: true
        });
        mainContentBox.add_child(messageBox/*, { y_align: St.Align.START }*/);
  
        this._subjectLabel = new St.Label({
          style_class: `polkit-dialog-headline`,
          style: `text-align: center; font-size: 1.6em; padding-bottom:1em`,
          text: _(title)
        });
  
        messageBox.add_child(this._subjectLabel/*, { y_fill: false, y_align: St.Align.START }*/);
        this._descriptionLabel = new St.Label({
          style_class: `polkit-dialog-description`,
          style: `text-align: center`,
          text: _(description)
        });
  
        messageBox.add_child(this._descriptionLabel/*, { y_fill: true, y_align: St.Align.START }*/);
  
        this.setButtons([
          {
            label: _("Cancel"),
            action: () => {
              this.close();
            },
            key: Clutter.Escape
          },
          {
            label: _("Confirm"),
            action: () => {
              this.close();
              action();
            }
          }
        ]);
      }
    });

function init(extensionMeta) {
  ExtensionUtils.initTranslations("downloads_indicator");
}

let _indicator;

function enable() {
  _indicator = new DownloadsMenu();
  Main.panel.addToStatusArea('downloads_indicator_button', _indicator);
}

function disable() {
  _indicator.destroy();
  _indicator = null;
}

