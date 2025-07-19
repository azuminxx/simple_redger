/**
 * タブ管理クラス
 */
class TabManager {
    constructor() {
        this.currentActiveTab = null;
    }

    /**
     * 検索メニューを初期化
     */
    initializeSearchMenu() {
        const searchMenuContainer = document.getElementById(CONFIG.system.searchMenuId);
        if (!searchMenuContainer) {
            console.error(CONFIG.system.messages.elementNotFound);
            return;
        }

        const tabContainer = this.createTabContainer();
        searchMenuContainer.appendChild(tabContainer);

        const firstAppId = Object.keys(CONFIG.apps)[0];
        this.switchTab(firstAppId);
    }

    /**
     * タブコンテナを作成
     */
    createTabContainer() {
        const tabContainer = DOMHelper.createElement('div', {}, 'tab-container');

        const tabMenu = this.createTabMenu();
        tabContainer.appendChild(tabMenu);

        Object.keys(CONFIG.apps).forEach(appId => {
            const tabContent = this.createTabContent(appId);
            tabContainer.appendChild(tabContent);
        });

        return tabContainer;
    }

    /**
     * タブメニューを作成
     */
    createTabMenu() {
        const tabMenu = DOMHelper.createElement('div', {}, 'tab-menu');

        Object.entries(CONFIG.apps).forEach(([appId, appConfig]) => {
            const tabButton = DOMHelper.createElement('button', {
                'data-app': appId
            }, 'tab-button');
            tabButton.textContent = appConfig.name;
            tabButton.addEventListener('click', () => this.switchTab(appId));
            
            tabMenu.appendChild(tabButton);
        });

        return tabMenu;
    }

    /**
     * タブコンテンツを作成
     */
    createTabContent(appId) {
        const appConfig = CONFIG.apps[appId];
        
        const tabContent = DOMHelper.createElement('div', {
            id: `tab-${appId}`
        }, 'tab-content');

        const searchForm = FormBuilder.createSearchForm(appId, appConfig);
        tabContent.appendChild(searchForm);

        return tabContent;
    }

    /**
     * タブを切り替え
     */
    switchTab(appId) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        const targetButton = document.querySelector(`[data-app="${appId}"]`);
        const targetContent = document.querySelector(`#tab-${appId}`);
        
        if (targetButton && targetContent) {
            targetButton.classList.add('active');
            targetContent.classList.add('active');
            this.currentActiveTab = appId;
        }
    }

    /**
     * 現在のアクティブタブを取得
     */
    getCurrentActiveTab() {
        return this.currentActiveTab;
    }
}

// グローバルに公開
window.TabManager = TabManager; 