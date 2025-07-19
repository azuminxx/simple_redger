/**
 * タブ管理クラス
 */
class TabManager {
    constructor() {
        this.currentActiveTab = null;
    }

    /**
     * 検索メニューを初期化（非同期対応）
     */
    async initializeSearchMenu() {
        const searchMenuContainer = document.getElementById(CONFIG.system.searchMenuId);
        if (!searchMenuContainer) {
            console.error(CONFIG.system.messages.elementNotFound);
            return;
        }

        const tabContainer = await this.createTabContainer();
        searchMenuContainer.appendChild(tabContainer);

        const firstAppId = Object.keys(CONFIG.apps)[0];
        this.switchTab(firstAppId);
    }

    /**
     * タブコンテナを作成（非同期対応）
     */
    async createTabContainer() {
        const tabContainer = DOMHelper.createElement('div', {}, 'tab-container');

        const tabMenu = this.createTabMenu();
        tabContainer.appendChild(tabMenu);

        // 各タブのコンテンツを非同期で作成
        for (const appId of Object.keys(CONFIG.apps)) {
            try {
                const tabContent = await this.createTabContent(appId);
                tabContainer.appendChild(tabContent);
            } catch (error) {
                console.error(`App ${appId}のタブ作成エラー:`, error);
                
                // エラー時はエラー表示のタブを作成
                const errorTabContent = this.createErrorTabContent(appId, error);
                tabContainer.appendChild(errorTabContent);
            }
        }

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
     * タブコンテンツを作成（非同期対応）
     */
    async createTabContent(appId) {
        const appConfig = CONFIG.apps[appId];
        
        const tabContent = DOMHelper.createElement('div', {
            id: `tab-${appId}`
        }, 'tab-content');

        // ローディング表示を追加
        const loadingMessage = DOMHelper.createElement('div', {}, 'loading-message');
        loadingMessage.textContent = 'フィールド情報を読み込み中...';
        tabContent.appendChild(loadingMessage);

        try {
            // 非同期でフォームを作成
            const searchForm = await FormBuilder.createSearchForm(appId, appConfig);
            
            // ローディングメッセージを削除
            tabContent.removeChild(loadingMessage);
            
            // フォームを追加
            tabContent.appendChild(searchForm);
        } catch (error) {
            // ローディングメッセージを削除
            tabContent.removeChild(loadingMessage);
            
            // エラーメッセージを表示
            const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
            errorMessage.textContent = `タブの初期化に失敗しました: ${error.message}`;
            tabContent.appendChild(errorMessage);
            
            throw error;
        }

        return tabContent;
    }

    /**
     * エラー用タブコンテンツを作成
     */
    createErrorTabContent(appId, error) {
        const tabContent = DOMHelper.createElement('div', {
            id: `tab-${appId}`
        }, 'tab-content error-tab');

        const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
        errorMessage.innerHTML = `
            <h4>タブの初期化に失敗しました</h4>
            <p>アプリID: ${appId}</p>
            <p>エラー: ${error.message}</p>
            <button onclick="location.reload()">ページを再読み込み</button>
        `;
        
        tabContent.appendChild(errorMessage);
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