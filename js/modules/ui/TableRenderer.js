/**
 * テーブル表示クラス
 */
class TableRenderer {
    constructor() {
        this.virtualScroll = new VirtualScroll();
    }

    /**
     * 統合データをテーブル表示
     */
    displayIntegratedTable(appId, integratedData) {
        // 結果表示エリアを取得
        const resultsContainer = document.getElementById(CONFIG.system.resultsContainerId);
        if (!resultsContainer) {
            console.error(`結果表示エリア（${CONFIG.system.resultsContainerId}）が見つかりません`);
            return;
        }

        // 既存の統合結果テーブルを削除
        const existingResults = resultsContainer.querySelector('.integrated-results');
        if (existingResults) {
            existingResults.remove();
        }

        // データが0件の場合は0件メッセージを表示
        if (integratedData.length === 0) {
            this.displayNoResultsMessage();
            return;
        }

        // 動的CSSを生成してテーブル幅を設定
        CSSGenerator.generateTableWidthCSS();

        // 統合結果コンテナを作成
        const integratedResultsContainer = DOMHelper.createElement('div', {}, 'integrated-results');

        // タイトルを作成
        const title = DOMHelper.createElement('h3');
        title.textContent = `統合検索結果（${integratedData.length}件）`;
        integratedResultsContainer.appendChild(title);

        // 仮想スクロール対応のテーブルコンテナを作成
        const tableContainer = this.virtualScroll.createVirtualScrollTable(integratedData);
        
        integratedResultsContainer.appendChild(tableContainer);
        resultsContainer.appendChild(integratedResultsContainer);
    }

    /**
     * 検索結果0件のメッセージを表示
     */
    displayNoResultsMessage() {
        const resultsContainer = document.getElementById(CONFIG.system.resultsContainerId);
        if (!resultsContainer) {
            console.error(`結果表示エリア（${CONFIG.system.resultsContainerId}）が見つかりません`);
            return;
        }

        // 統合結果コンテナを作成
        const integratedResultsContainer = DOMHelper.createElement('div', {}, 'integrated-results');

        // タイトルを作成
        const title = DOMHelper.createElement('h3');
        title.textContent = '統合検索結果（0件）';
        integratedResultsContainer.appendChild(title);

        // 0件メッセージを作成
        const noResultsMessage = DOMHelper.createElement('div', {}, 'no-results-message');
        noResultsMessage.textContent = CONFIG.system.messages.noResults;
        integratedResultsContainer.appendChild(noResultsMessage);

        resultsContainer.appendChild(integratedResultsContainer);
    }

    /**
     * 台帳名ヘッダー行を作成（結合あり）
     */
    createLedgerHeaderRow() {
        const row = DOMHelper.createElement('tr');
        
        // 台帳名ごとにグループ化
        const ledgerGroups = this.groupColumnsByLedger();
        
        ledgerGroups.forEach(group => {
            const th = DOMHelper.createElement('th');
            th.textContent = group.ledgerName;
            th.className = 'header-ledger-cell';
            th.colSpan = group.columns.length;
            
            row.appendChild(th);
        });
        
        return row;
    }

    /**
     * フィールド名ヘッダー行を作成
     */
    createFieldHeaderRow() {
        const row = DOMHelper.createElement('tr');
        
        CONFIG.integratedTableConfig.columns.forEach(column => {
            const th = DOMHelper.createElement('th');
            th.textContent = column.label;
            th.className = 'header-field-cell';
            
            row.appendChild(th);
        });
        
        return row;
    }

    /**
     * colgroup要素を作成してカラム幅を定義
     */
    createColgroup() {
        const colgroup = DOMHelper.createElement('colgroup');
        
        CONFIG.integratedTableConfig.columns.forEach((column, index) => {
            const col = DOMHelper.createElement('col');
            // インラインCSSを避け、クラス名で幅を制御
            col.className = `col-${index}`;
            colgroup.appendChild(col);
        });
        
        return colgroup;
    }

    /**
     * カラムを台帳名でグループ化
     */
    groupColumnsByLedger() {
        const groups = [];
        let currentGroup = null;
        
        CONFIG.integratedTableConfig.columns.forEach(column => {
            const ledgerName = DOMHelper.getLedgerNameFromKey(column.key);
            
            if (!currentGroup || currentGroup.ledgerName !== ledgerName) {
                // 新しいグループを開始
                currentGroup = {
                    ledgerName: ledgerName,
                    columns: []
                };
                groups.push(currentGroup);
            }
            
            currentGroup.columns.push(column);
        });
        
        return groups;
    }
}

// グローバルに公開
window.TableRenderer = TableRenderer; 