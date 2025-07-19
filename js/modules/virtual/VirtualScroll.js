/**
 * 仮想スクロールクラス
 */
class VirtualScroll {
    /**
     * 仮想スクロール対応テーブルを作成
     */
    createVirtualScrollTable(integratedData) {
        // メインコンテナ
        const container = DOMHelper.createElement('div', {}, 'integrated-table-container');
        
        // 仮想スクロールコンテナ（ボディ専用）
        const scrollContainer = DOMHelper.createElement('div', {}, 'virtual-scroll-container');
        
        // 全体の高さを表すスペーサー
        const spacer = DOMHelper.createElement('div', {}, 'virtual-scroll-spacer');
        const totalHeight = integratedData.length * CONFIG.virtualScroll.rowHeight;
        spacer.style.height = `${totalHeight}px`;
        
        // 実際のコンテンツ領域
        const content = DOMHelper.createElement('div', {}, 'virtual-scroll-content');
        
        // ボディテーブル（仮想スクロール）
        const bodyTable = DOMHelper.createElement('table', {}, 'integrated-table virtual-body');
        const colgroup = this.createColgroup();
        bodyTable.appendChild(colgroup);
        const tbody = DOMHelper.createElement('tbody');
        bodyTable.appendChild(tbody);
        content.appendChild(bodyTable);
        
        // ヘッダーテーブル（固定表示、スクロール外）- ボディテーブル作成後に作成
        const headerTable = this.createHeaderTable();
        container.appendChild(headerTable);
        
        // 仮想スクロール状態を管理
        const virtualState = {
            data: integratedData,
            startIndex: 0,
            endIndex: Math.min(CONFIG.virtualScroll.visibleRows, integratedData.length),
            tbody: tbody,
            headerTable: headerTable,
            bodyTable: bodyTable
        };
        
        // 初期レンダリング
        this.renderVirtualRows(virtualState);
        
        // スクロールイベント
        scrollContainer.addEventListener('scroll', () => {
            this.handleVirtualScroll(scrollContainer, virtualState);
            // ヘッダーの横スクロールを同期
            this.syncHeaderScroll(headerTable, scrollContainer);
        });
        
        scrollContainer.appendChild(spacer);
        scrollContainer.appendChild(content);
        container.appendChild(scrollContainer);
        
        return container;
    }

    /**
     * ヘッダーテーブルを作成（固定表示用）
     */
    createHeaderTable() {
        const table = DOMHelper.createElement('table', {}, 'integrated-table virtual-header');
        
        const colgroup = this.createColgroup();
        table.appendChild(colgroup);
        
        const thead = DOMHelper.createElement('thead');
        
        // 1行目：台帳名（結合あり）
        const ledgerRow = window.tableRenderer.createLedgerHeaderRow();
        thead.appendChild(ledgerRow);
        
        // 2行目：フィールド名
        const fieldRow = window.tableRenderer.createFieldHeaderRow();
        thead.appendChild(fieldRow);
        
        table.appendChild(thead);
        return table;
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
     * 仮想スクロールの行をレンダリング
     */
    renderVirtualRows(virtualState) {
        const { data, startIndex, endIndex, tbody, headerTable, bodyTable } = virtualState;
        
        // 既存の行をクリア
        tbody.innerHTML = '';
        
        // 表示範囲の行を作成
        for (let i = startIndex; i < endIndex; i++) {
            if (i >= data.length) break;
            
            const record = data[i];
            const row = DOMHelper.createElement('tr');
            
            CONFIG.integratedTableConfig.columns.forEach(column => {
                const td = DOMHelper.createElement('td');
                const value = record[column.key];
                
                if (value === null || value === undefined || value === '') {
                    td.textContent = '-';
                    td.className = 'null-value';
                } else {
                    td.textContent = value;
                }
                
                row.appendChild(td);
            });
            
            tbody.appendChild(row);
        }
        
        // オフセット設定（上部の空白を作る）
        const offsetTop = startIndex * CONFIG.virtualScroll.rowHeight;
        tbody.style.transform = `translateY(${offsetTop}px)`;
        
        // 初回レンダリング完了
        if (startIndex === 0 && !tbody._initialized) {
            tbody._initialized = true;
        }
    }

    /**
     * 仮想スクロールハンドラー
     */
    handleVirtualScroll(scrollContainer, virtualState) {
        const scrollTop = scrollContainer.scrollTop;
        const { rowHeight, visibleRows, bufferRows } = CONFIG.virtualScroll;
        
        // 現在の表示開始インデックスを計算
        const newStartIndex = Math.floor(scrollTop / rowHeight);
        const bufferStart = Math.max(0, newStartIndex - bufferRows);
        const bufferEnd = Math.min(
            virtualState.data.length,
            newStartIndex + visibleRows + bufferRows
        );
        
        // 表示範囲が変わった場合のみ再レンダリング
        if (bufferStart !== virtualState.startIndex || bufferEnd !== virtualState.endIndex) {
            virtualState.startIndex = bufferStart;
            virtualState.endIndex = bufferEnd;
            this.renderVirtualRows(virtualState);
        }
    }

    /**
     * ヘッダーの横スクロールを同期
     */
    syncHeaderScroll(headerTable, scrollContainer) {
        headerTable.style.transform = `translateX(-${scrollContainer.scrollLeft}px)`;
    }
}

// グローバルに公開
window.VirtualScroll = VirtualScroll; 