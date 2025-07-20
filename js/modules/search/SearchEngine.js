/**
 * 検索エンジンクラス
 */
class SearchEngine {
    constructor() {
        this.isSearching = false;
        this.activeCursors = new Set(); // アクティブなカーソルIDを管理
        this.cursorAppMap = new Map(); // カーソルIDとappIdのマッピング
        this.retryCount = 0; // 再試行回数を管理
        this.maxRetries = 1; // 最大再試行回数
    }
    /**
     * レコードを検索
     */
    async searchRecords(appId) {
        // 検索中の場合は新しい検索をブロック
        if (this.isSearching) {
            alert('検索実行中です。しばらくお待ちください。');
            return;
        }

        try {
            this.isSearching = true;
            this.retryCount = 0; // 検索開始時に再試行回数をリセット
            
            const searchConditions = await this.getSearchConditions(appId);
            
            if (Object.keys(searchConditions).length === 0) {
                alert(CONFIG.system.messages.noSearchCondition);
                return;
            }

            const query = await this.buildSearchQuery(searchConditions, appId);
            
            console.log(`🔍 ${CONFIG.apps[appId].name}で検索実行: ${query}`);
            
            // 通常の検索では既存の結果をクリア
            if (window.tableRenderer) {
                window.tableRenderer.clearSearchResults();
            }
            
            // メインの台帳を検索
            const records = await this.searchRecordsWithQuery(appId, query);
            console.log(`✓ ${CONFIG.apps[appId].name}の検索結果: ${records.length}件`);
            
            if (records.length > 0) {
                // 統合キーを抽出して他の台帳も検索
                const integratedData = await window.dataIntegrator.searchAllLedgersWithIntegrationKeys(appId, records);
                
                if (integratedData) {
                    // テーブル表示
                    if (window.tableRenderer) {
                        window.tableRenderer.displayIntegratedTable(appId, integratedData);
                    }
                }
            } else {
                console.log(CONFIG.system.messages.noResults);
                // 0件の場合もテーブル表示処理を呼び出し（空の配列を渡す）
                if (window.tableRenderer) {
                    window.tableRenderer.displayIntegratedTable(appId, []);
                }
            }
            
            // データ抽出完了後のカーソル状況をログ出力
            this.logCursorStatus('通常検索');
            
            // API実行回数サマリーを表示
            window.apiCounter.showSummary();
        } catch (error) {
            console.error('検索エラー:', error);
            alert(`${CONFIG.system.messages.searchError}\n詳細: ${error.message}`);
        } finally {
            this.isSearching = false;
        }
    }

    /**
     * 検索条件を取得（動的フィールド情報対応）
     */
    async getSearchConditions(appId) {
        const conditions = {};
        
        try {
            const fields = await window.fieldInfoAPI.getAppFields(appId);
            
            fields.forEach(field => {
                if (field.type === 'checkbox') {
                    // チェックボックスの場合は複数の値を取得
                    const checkboxes = document.querySelectorAll(`input[name="${field.code}-${appId}"]:checked`);
                    const values = Array.from(checkboxes).map(cb => cb.value);
                    if (values.length > 0) {
                        conditions[field.code] = values;
                    }
                } else if (field.type === 'dropdown' || field.type === 'radio') {
                    // ドロップダウン/ラジオボタンの場合は単一選択
                    const select = document.getElementById(`${field.code}-${appId}`);
                    if (select && select.value && select.value.trim() !== '') {
                        conditions[field.code] = select.value.trim();
                    }
                } else {
                    // その他のフィールドは単一値を取得
                    const input = document.getElementById(`${field.code}-${appId}`);
                    if (input && input.value && input.value.trim() !== '') {
                        conditions[field.code] = input.value.trim();
                    }
                }
            });
        } catch (error) {
            this.logError(`App ${appId}の検索条件取得`, error);
        }

        return conditions;
    }

    /**
     * 検索クエリを構築（動的フィールド情報対応）
     */
    async buildSearchQuery(conditions, appId) {
        const queryParts = [];
        
        try {
            const fields = await window.fieldInfoAPI.getAppFields(appId);

            for (const [fieldCode, value] of Object.entries(conditions)) {
                const fieldConfig = fields.find(field => field.code === fieldCode);
                
                if (!fieldConfig) {
                    console.warn(`フィールド ${fieldCode} の設定が見つかりません`);
                    continue;
                }
                
                if (fieldConfig.type === 'dropdown' || fieldConfig.type === 'radio') {
                    queryParts.push(`${fieldCode} in ("${value}")`);
                } else if (fieldConfig.type === 'checkbox' && Array.isArray(value)) {
                    // チェックボックスの場合は OR 条件で結合
                    const checkboxQueries = value.map(v => `${fieldCode} like "${v}"`);
                    if (checkboxQueries.length > 0) {
                        queryParts.push(`(${checkboxQueries.join(' or ')})`);
                    }
                } else if (fieldConfig.type === 'number') {
                    // 数値フィールドは完全一致
                    queryParts.push(`${fieldCode} = ${value}`);
                } else if (fieldConfig.type === 'date' || fieldConfig.type === 'datetime-local') {
                    // 日付フィールドは範囲検索も可能だが、ここでは完全一致
                    queryParts.push(`${fieldCode} = "${value}"`);
                } else {
                    // テキストフィールドは部分一致
                    queryParts.push(`${fieldCode} like "${value}"`);
                }
            }
        } catch (error) {
            this.logError(`App ${appId}の検索クエリ構築`, error);
            // エラー時は基本的な like 検索にフォールバック
            for (const [fieldCode, value] of Object.entries(conditions)) {
                if (Array.isArray(value)) {
                    const queries = value.map(v => `${fieldCode} like "${v}"`);
                    queryParts.push(`(${queries.join(' or ')})`);
                } else {
                    queryParts.push(`${fieldCode} like "${value}"`);
                }
            }
        }

        return queryParts.join(' and ');
    }

    /**
     * クエリでレコードを検索（カーソルAPI使用）
     */
    searchRecordsWithQuery(appId, query) {
        return this.createCursor(appId, query)
            .then((cursorId) => {
                return this.getAllRecordsFromCursor(cursorId);
            });
    }

    /**
     * カーソルを作成
     */
    createCursor(appId, query) {
        const body = {
            app: appId,
            query: query || '',
            size: CONFIG.system.cursorSize
        };

        // API実行回数をカウント
        window.apiCounter.count(appId, 'カーソル作成');
        
        return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'POST', body)
            .then((response) => {
                this.activeCursors.add(response.id); // アクティブカーソルに追加
                this.cursorAppMap.set(response.id, appId); // カーソルとappIdのマッピング
                this.retryCount = 0; // 成功時は再試行回数をリセット
                // カーソル作成ログは削除（サマリーで表示）
                return response.id;
            })
            .catch(async (error) => {
                console.error('❌ カーソル作成エラー:', error);
                
                // 再試行回数制限をチェック
                if (this.retryCount >= this.maxRetries) {
                    console.error('❌ 最大再試行回数に達しました。カーソル作成を諦めます。');
                    this.retryCount = 0; // リセット
                    throw error;
                }
                
                // カーソル上限エラーの場合は自動クリーンアップを試行
                if (error.message && error.message.includes('カーソル')) {
                    this.retryCount++;
                    console.log(`🧹 カーソル上限エラーのため自動クリーンアップを実行... (試行回数: ${this.retryCount}/${this.maxRetries})`);
                    
                    try {
                        await this.deleteAllActiveCursors();
                        
                        // 少し待機してからクリーンアップ
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // クリーンアップ後に再試行（再帰的に呼び出し）
                        console.log('🔄 カーソル作成を再試行...');
                        return this.createCursor(appId, query);
                        
                    } catch (cleanupError) {
                        console.error('❌ 自動クリーンアップエラー:', cleanupError);
                        this.retryCount = 0; // エラー時もリセット
                    }
                }
                
                this.retryCount = 0; // その他のエラー時もリセット
                throw error;
            });
    }

    /**
     * カーソルを使用して全レコードを取得
     */
    getAllRecordsFromCursor(cursorId) {
        const allRecords = [];

        const fetchRecords = () => {
            const body = {
                id: cursorId
            };

            // API実行回数をカウント
            const appId = this.cursorAppMap.get(cursorId);
            if (appId) {
                window.apiCounter.count(appId, 'レコード取得');
            }

            return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'GET', body)
                .then((response) => {
                    allRecords.push(...response.records);
                    
                    if (response.next) {
                        return fetchRecords();
                    } else {
                        // レコード取得完了時はカーソルが自動削除されるため、明示的な削除は不要
                        // ただし、アクティブカーソル管理から削除
                        this.activeCursors.delete(cursorId);
                        this.cursorAppMap.delete(cursorId);
                        // レコード取得完了ログは削除（サマリーで表示）
                        return allRecords;
                    }
                })
                .catch((error) => {
                    // エラー時はカーソル削除を試行（存在しない場合のエラーは無視）
                    return this.deleteCursor(cursorId).then(() => {
                        throw error;
                    }).catch(() => {
                        // カーソル削除エラーは無視して元のエラーを投げる
                        throw error;
                    });
                });
        };

        return fetchRecords();
    }

    /**
     * カーソルを削除
     */
    deleteCursor(cursorId) {
        const body = {
            id: cursorId
        };

        // API実行回数をカウント
        const appId = this.cursorAppMap.get(cursorId);
        if (appId) {
            window.apiCounter.count(appId, 'カーソル削除');
        }

        return kintone.api(kintone.api.url('/k/v1/records/cursor.json', true), 'DELETE', body)
            .then(() => {
                this.activeCursors.delete(cursorId); // アクティブカーソルから削除
                this.cursorAppMap.delete(cursorId); // マッピングからも削除
                // カーソル削除完了ログは削除（サマリーで表示）
            })
            .catch((error) => {
                this.activeCursors.delete(cursorId); // エラーでも削除扱い
                this.cursorAppMap.delete(cursorId); // マッピングからも削除
                
                // GAIA_CN01エラー（カーソルが存在しない）の場合は詳細ログを抑制
                if (error.code === 'GAIA_CN01') {
                    // カーソル削除済みログは削除（サマリーで表示）
                } else {
                    console.warn(`⚠️ カーソル削除エラー: ${cursorId}`, error);
                }
            });
    }

    /**
     * 全てのアクティブカーソルを削除
     */
    async deleteAllActiveCursors() {
        if (this.activeCursors.size === 0) {
            console.log('🧹 削除対象のアクティブカーソルはありません');
            return;
        }

        console.log(`🧹 アクティブカーソルを削除中... (${this.activeCursors.size}件)`);
        
        const deletePromises = Array.from(this.activeCursors).map(cursorId => {
            return this.deleteCursor(cursorId);
        });

        try {
            await Promise.all(deletePromises);
            console.log('✅ 全てのアクティブカーソルを削除完了');
        } catch (error) {
            console.warn('⚠️ 一部のカーソル削除でエラーが発生しました:', error);
        }

        // 念のためセットをクリア
        this.activeCursors.clear();
    }



    /**
     * 追加検索を実行（既存の結果にマージ）
     */
    async addSearchRecords(appId) {
        // 検索中の場合は新しい検索をブロック
        if (this.isSearching) {
            alert('検索実行中です。しばらくお待ちください。');
            return;
        }

        try {
            this.isSearching = true;
            this.retryCount = 0; // 追加検索開始時に再試行回数をリセット
            
            const searchConditions = await this.getSearchConditions(appId);
            
            if (Object.keys(searchConditions).length === 0) {
                alert(CONFIG.system.messages.noSearchCondition);
                return;
            }

            const query = await this.buildSearchQuery(searchConditions, appId);
            
            console.log(`🔍 ${CONFIG.apps[appId].name}で追加検索実行: ${query}`);
            
            // メインの台帳を検索
            const records = await this.searchRecordsWithQuery(appId, query);
            console.log(`✓ ${CONFIG.apps[appId].name}の追加検索結果: ${records.length}件`);
            
            if (records.length > 0) {
                // 統合キーを抽出して他の台帳も検索
                const newIntegratedData = await window.dataIntegrator.searchAllLedgersWithIntegrationKeys(appId, records);
                
                if (newIntegratedData) {
                    // 既存の検索結果と新しい結果をマージ
                    const existingData = window.tableRenderer.getCurrentSearchResults();
                    const mergedData = window.dataIntegrator.mergeIntegratedData(existingData, newIntegratedData);
                    
                    console.log(`🔄 データマージ完了: 既存${existingData.length}件 + 新規${newIntegratedData.length}件 → 統合${mergedData.length}件`);
                    
                    // テーブル表示
                    if (window.tableRenderer) {
                        window.tableRenderer.displayIntegratedTable(appId, mergedData);
                    }
                }
            } else {
                console.log(`${CONFIG.system.messages.noResults}（追加検索）`);
                // 追加検索で0件の場合は既存の結果をそのまま保持
                alert('追加検索の結果が0件でした。既存の検索結果はそのまま表示されます。');
            }
            
            // データ抽出完了後のカーソル状況をログ出力
            this.logCursorStatus('追加検索');
            
            // API実行回数サマリーを表示
            window.apiCounter.showSummary();
        } catch (error) {
            console.error('追加検索エラー:', error);
            alert(`追加検索中にエラーが発生しました。\n詳細: ${error.message}`);
        } finally {
            this.isSearching = false;
        }
    }

    /**
     * カーソル状況をログ出力（簡潔版）
     */
    logCursorStatus(operation) {
        const activeCount = this.activeCursors.size;
        
        if (activeCount === 0) {
            console.log(`✅ ${operation}完了 - カーソル管理正常`);
        } else {
            console.warn(`⚠️ ${operation}完了 - 未削除カーソル: ${activeCount}件`);
            
            // 未削除カーソルがある場合は手動削除を試行
            this.deleteAllActiveCursors().then(() => {
                console.log(`🧹 カーソルクリーンアップ完了`);
            }).catch(error => {
                this.logError('カーソルクリーンアップ', error);
            });
        }
    }

    /**
     * エラーログを統一フォーマットで出力
     */
    logError(operation, error) {
        console.error(`❌ ${operation}エラー:`, error);
    }
}

// グローバルに公開
window.SearchEngine = SearchEngine; 