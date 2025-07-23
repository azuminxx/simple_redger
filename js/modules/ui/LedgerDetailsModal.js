/**
 * 台帳詳細モーダルクラス
 */
class LedgerDetailsModal {
    constructor() {
        this.currentModal = null;
    }

    /**
     * 3つの台帳詳細をモーダルで表示
     */
    show(integrationKey, record) {
        // 既存のモーダルを削除
        this.close();

        // モーダル要素を作成
        const modal = DOMHelper.createElement('div', {}, 'ledger-details-modal');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 999999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const content = DOMHelper.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 6px;
            padding: 12px;
            max-width: 1200px;
            max-height: 95vh;
            width: 95%;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            font-size: 13px;
            z-index: 1000000;
            position: relative;
        `;

        // ヘッダー（ドラッグハンドル）
        const header = this.createHeader(integrationKey, modal);
        
        // 各台帳のセクション
        const body = this.createBody(record);

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);

        // ドラッグ機能を追加
        this.makeDraggable(modal, header);

        // 背景クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.close();
            }
        });

        document.body.appendChild(modal);
        this.currentModal = modal;
    }

    /**
     * モーダルを閉じる
     */
    close() {
        if (this.currentModal) {
            this.currentModal.remove();
            this.currentModal = null;
        }
    }

    /**
     * ヘッダー部分を作成
     */
    createHeader(integrationKey, modal) {
        const header = DOMHelper.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #dee2e6;
            cursor: move;
            user-select: none;
        `;
        header.setAttribute('data-drag-handle', 'true');

        const title = DOMHelper.createElement('h5');
        title.textContent = `統合キー: ${integrationKey} の詳細`;
        title.style.cssText = 'font-size: 15px; font-weight: bold; color: #495057; margin: 0;';

        const closeButton = DOMHelper.createElement('button');
        closeButton.textContent = '閉じる';
        closeButton.style.cssText = `
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 3px;
            padding: 6px 12px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
        `;
        closeButton.addEventListener('click', () => this.close());

        header.appendChild(title);
        header.appendChild(closeButton);

        return header;
    }

    /**
     * ボディ部分を作成
     */
    createBody(record) {
        const body = DOMHelper.createElement('div');
        body.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

        // 3つの台帳をiframeで上中下に表示
        CONFIG.ledgerNames.forEach(ledgerName => {
            const iframeSection = this.createLedgerIframeSection(ledgerName, record);
            body.appendChild(iframeSection);
        });

        return body;
    }

    /**
     * 台帳iframeセクションを作成
     */
    createLedgerIframeSection(ledgerName, record) {
        const baseUrl = 'https://fps62oxtrbhh.cybozu.com/k';
        const appId = CONFIG.getAppIdByLedgerName(ledgerName);
        
        const section = DOMHelper.createElement('div');
        section.style.cssText = `
            border: 1px solid #dee2e6;
            border-radius: 4px;
            overflow: hidden;
            height: 250px;
        `;

        // レコードIDを取得
        const recordIdKey = `${ledgerName}_$id`;
        const recordId = record[recordIdKey];
        
        if (recordId) {
            const recordUrl = `${baseUrl}/${appId}/show#record=${recordId}`;
            
            // iframeコンテナを作成（縮小表示用）
            const iframeContainer = DOMHelper.createElement('div');
            iframeContainer.style.cssText = `
                width: 100%;
                height: 250px;
                overflow: hidden;
                position: relative;
            `;

            // iframeを作成（縮小表示）
            const iframe = DOMHelper.createElement('iframe');
            iframe.src = recordUrl;
            iframe.style.cssText = `
                width: 166.67%;
                height: 416px;
                border: none;
                background: white;
                transform: scale(0.6);
                transform-origin: top left;
                position: absolute;
                top: 0;
                left: 0;
            `;
            
            // iframe読み込みエラー対応
            iframe.addEventListener('error', () => {
                const errorMsg = DOMHelper.createElement('div');
                errorMsg.textContent = 'レコードの読み込みに失敗しました';
                errorMsg.style.cssText = `
                    padding: 12px;
                    text-align: center;
                    color: #dc3545;
                    height: 250px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                `;
                section.appendChild(errorMsg);
                return;
            });
            
            iframeContainer.appendChild(iframe);
            section.appendChild(iframeContainer);
        } else {
            const noDataMessage = DOMHelper.createElement('div');
            noDataMessage.textContent = 'この台帳にはデータがありません';
            noDataMessage.style.cssText = `
                color: #6c757d;
                font-style: italic;
                text-align: center;
                padding: 12px;
                height: 250px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
            `;
            
            section.appendChild(noDataMessage);
        }
        
        return section;
    }

    /**
     * モーダルをドラッグ可能にする
     */
    makeDraggable(modal, dragHandle) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        const content = modal.querySelector('div');
        content.style.position = 'relative';

        // マウスダウン
        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const style = window.getComputedStyle(content);
            initialX = parseInt(style.left) || 0;
            initialY = parseInt(style.top) || 0;
            
            content.style.transition = 'none';
            e.preventDefault();
        });

        // マウス移動
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const newX = initialX + (e.clientX - startX);
            const newY = initialY + (e.clientY - startY);
            
            // シンプルな制限
            const maxX = window.innerWidth - content.offsetWidth * 0.5;
            const maxY = window.innerHeight - 60;
            
            // 上方向の制限をより緩く（ヘッダー部分だけ見えていればOK）
            const minY = -content.offsetHeight + 80; // ヘッダー80px分だけ見えていればOK
            
            const clampedX = Math.max(-content.offsetWidth * 0.5, Math.min(newX, maxX));
            const clampedY = Math.max(minY, Math.min(newY, maxY));
            
            content.style.left = clampedX + 'px';
            content.style.top = clampedY + 'px';
        });

        // マウスアップ
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                content.style.transition = '';
            }
        });
    }

    /**
     * レコードから統合キーを取得
     */
    static getIntegrationKeyFromRecord(record) {
        // 各台帳の統合キーフィールドから値を取得
        const pcLedgerName = CONFIG.integratedTableConfig.columns.find(c => c.fieldCode === 'PC番号' && c.primaryKey).ledger;
        const integrationKeyField = `${pcLedgerName}_${CONFIG.integrationKey}`;
        return record[integrationKeyField] || 'Unknown';
    }
}

// グローバルに公開
window.LedgerDetailsModal = LedgerDetailsModal; 