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

        // タブコンテナを作成
        const tabContainer = await this.createTabContainer();
        searchMenuContainer.appendChild(tabContainer);

        // 開閉トグルボタンを下部に追加
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggle-search-form';
        toggleBtn.className = 'search-toggle-btn';
        toggleBtn.textContent = '▲';
        toggleBtn.style.display = 'block';
        toggleBtn.style.margin = '8px auto 0 auto';
        searchMenuContainer.appendChild(toggleBtn);

        // タブボタン以外の.tab-contentをまとめて取得
        const updateTabContentVisibility = (open) => {
            const tabContents = tabContainer.querySelectorAll('.tab-content');
            tabContents.forEach(tabContent => {
                if (open) {
                    tabContent.style.height = 'auto';
                    tabContent.style.overflow = 'visible';
                } else {
                    tabContent.style.height = '0px';
                    tabContent.style.overflow = 'hidden';
                }
            });
        };
        // 初期状態は開いている
        updateTabContentVisibility(true);

        toggleBtn.addEventListener('click', () => {
            const isClosed = Array.from(tabContainer.querySelectorAll('.tab-content')).every(tc => tc.style.height === '0px');
            if (isClosed) {
                updateTabContentVisibility(true);
                toggleBtn.textContent = '▲';
            } else {
                updateTabContentVisibility(false);
                toggleBtn.textContent = '▼';
            }
        });

        const firstAppId = Object.keys(CONFIG.apps)[0];
        this.switchTab(firstAppId);
    }

    /**
     * タブコンテナを作成
     */
    async createTabContainer() {
        const tabContainer = DOMHelper.createElement('div', {}, 'tab-container');

        const tabMenu = this.createTabMenu();
        tabContainer.appendChild(tabMenu);

        // 各台帳のタブコンテンツを作成
        for (const appId of Object.keys(CONFIG.apps)) {
            try {
                const tabContent = await this.createTabContent(appId);
                tabContainer.appendChild(tabContent);
            } catch (error) {
                console.error(`App ${appId}のタブ作成エラー:`, error);
                
                // エラー時は基本的なタブを作成
                const errorTabContent = DOMHelper.createElement('div', {
                    id: `tab-${appId}`
                }, 'tab-content');
                
                const errorMessage = DOMHelper.createElement('div', {}, 'error-message');
                errorMessage.textContent = `${CONFIG.apps[appId].name}のタブ初期化に失敗しました`;
                errorTabContent.appendChild(errorMessage);
                
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

        // 各台帳のタブを作成
        Object.entries(CONFIG.apps).forEach(([appId, appConfig]) => {
            const tabButton = DOMHelper.createElement('button', {}, 'tab-button');
            tabButton.setAttribute('data-app', appId);
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
            // FormBuilderインスタンスを作成
            const formBuilder = new FormBuilder();
            
            // 指定されたappIdの検索フォームを作成
            const formHTML = await formBuilder.buildSearchForm(appId);
            
            // ローディングメッセージを削除
            tabContent.removeChild(loadingMessage);
            
            // フォームHTMLを直接挿入
            tabContent.innerHTML = formHTML;
            
            // 個別タブ用の検索ボタンとクリアボタンを追加
            const buttonGroup = this.createIndividualButtonGroup(appId);
            tabContent.appendChild(buttonGroup);
            
        } catch (error) {
            // ローディングメッセージを削除
            if (tabContent.contains(loadingMessage)) {
                tabContent.removeChild(loadingMessage);
            }
            
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
        // 全てのタブボタンから active クラスを削除
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => button.classList.remove('active'));

        // 全てのタブコンテンツを非表示
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => content.classList.remove('active'));

        // 指定されたタブボタンに active クラスを追加
        const activeButton = document.querySelector(`[data-app="${appId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }

        // 指定されたタブコンテンツを表示
        const activeContent = document.getElementById(`tab-${appId}`);
        if (activeContent) {
            activeContent.classList.add('active');
        }

        this.currentActiveTab = appId;
    }

    /**
     * 個別タブ用のボタングループを作成
     */
    createIndividualButtonGroup(appId) {
        const buttonGroup = DOMHelper.createElement('div', {}, 'button-group');

        const searchButton = DOMHelper.createElement('button', {}, 'search-button');
        searchButton.textContent = '検索';
        searchButton.setAttribute('data-app-id', appId);
        searchButton.addEventListener('click', () => {
            if (window.searchEngine) {
                window.searchEngine.searchRecords(appId);
            }
        });

        const addSearchButton = DOMHelper.createElement('button', {}, 'add-search-button');
        addSearchButton.textContent = '追加検索';
        addSearchButton.setAttribute('data-app-id', appId);
        addSearchButton.addEventListener('click', () => {
            if (window.searchEngine) {
                window.searchEngine.addSearchRecords(appId);
            }
        });

        const clearButton = DOMHelper.createElement('button', {}, 'clear-button');
        clearButton.textContent = 'クリア';
        clearButton.addEventListener('click', () => this.clearForm(appId));

        buttonGroup.appendChild(searchButton);
        buttonGroup.appendChild(addSearchButton);
        buttonGroup.appendChild(clearButton);

        return buttonGroup;
    }

    /**
     * 指定されたタブのフォームをクリア
     */
    clearForm(appId) {
        const tabContent = document.querySelector(`#tab-${appId}`);
        if (!tabContent) return;
        
        // テキスト入力をクリア
        const inputs = tabContent.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="datetime-local"]');
        inputs.forEach(input => {
            input.value = '';
        });

        // セレクトボックスをリセット
        const selects = tabContent.querySelectorAll('select');
        selects.forEach(select => {
            if (select.multiple) {
                // 複数選択リストボックスは全て未選択に
                Array.from(select.options).forEach(option => option.selected = false);
            } else {
                select.selectedIndex = 0;
            }
        });

        // チェックボックスをクリア
        const checkboxes = tabContent.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
    }

}

// グローバルに公開
window.TabManager = TabManager; 