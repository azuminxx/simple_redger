/**
 * データ統合クラス
 */
class DataIntegrator {
    /**
     * 統合キーを使って全台帳を検索
     */
    searchAllLedgersWithIntegrationKeys(originalAppId, originalRecords) {
        // 統合キーを抽出
        const integrationKeys = this.extractIntegrationKeys(originalRecords);
        
        if (integrationKeys.length === 0) {
            console.log(CONFIG.system.messages.noIntegrationKeys);
            return Promise.resolve([]);
        }

        console.log(`🔗 統合キー抽出: ${integrationKeys.length}件`);

        // 全台帳のデータを格納するオブジェクト
        const allLedgerData = {};
        allLedgerData[originalAppId] = originalRecords;

        // 他の台帳を検索するPromiseを作成（ユーザーリストは除外）
        const searchPromises = [];
        
        Object.keys(CONFIG.apps).forEach(appId => {
            if (appId !== originalAppId) {
                const promise = this.searchByIntegrationKeys(appId, integrationKeys)
                    .then(records => {
                        allLedgerData[appId] = records;
                        console.log(`✓ ${CONFIG.apps[appId].name}: ${records.length}件`);
                        return records;
                    });
                searchPromises.push(promise);
            }
        });

        // ユーザーリストをユーザーIDで検索するPromiseを追加
        const userListPromise = this.searchUserListByUserIds(allLedgerData)
            .then(userListData => {
                console.log(`✓ ユーザーリスト: ${userListData.length}件`);
                return userListData;
            });
        searchPromises.push(userListPromise);

        // 全ての検索が完了したらデータを統合
        return Promise.all(searchPromises)
            .then(async (results) => {
                // 最後の結果がユーザーリストデータ
                const userListData = results.pop();
                return await this.integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData);
            });
    }

    /**
     * レコードから統合キーを抽出
     */
    extractIntegrationKeys(records) {
        const integrationKeys = new Set();
        
        records.forEach(record => {
            const keyField = record[CONFIG.integrationKey];
            if (keyField && keyField.value) {
                integrationKeys.add(keyField.value);
            }
        });

        return Array.from(integrationKeys);
    }

    /**
     * 統合キーを使って特定の台帳を検索
     */
    searchByIntegrationKeys(appId, integrationKeys) {
        // IN演算子で統合キーの配列を検索
        const keyList = integrationKeys.map(key => `"${key}"`).join(',');
        const query = `${CONFIG.integrationKey} in (${keyList})`;
        
        return window.searchEngine.searchRecordsWithQuery(appId, query);
    }

    /**
     * 全台帳からユーザーIDを抽出してユーザーリストを検索
     */
    searchUserListByUserIds(allLedgerData) {
        const userIds = new Set();
        
        // 全台帳からユーザーIDを抽出
        Object.values(allLedgerData).forEach(records => {
            records.forEach(record => {
                const userIdField = record['ユーザーID'];
                if (userIdField && userIdField.value) {
                    userIds.add(userIdField.value);
                }
            });
        });

        if (userIds.size === 0) {
            console.log('ユーザーIDが見つかりませんでした。');
            return Promise.resolve([]);
        }

        // ユーザーIDでユーザーリストを検索
        const userIdList = Array.from(userIds).map(id => `"${id}"`).join(',');
        const query = `ユーザーID in (${userIdList})`;
        
        return window.searchEngine.searchRecordsWithQuery(CONFIG.userList.appId, query);
    }

    /**
     * 全台帳のデータを統合キーで統合し、ユーザーリストからユーザー名を取得
     */
    async integrateAllLedgerDataWithUserList(allLedgerData, integrationKeys, userListData) {
        const integratedData = [];

        // ユーザーリストをユーザーIDでマップ化
        const userMap = new Map();
        userListData.forEach(user => {
            const userId = user['ユーザーID'] && user['ユーザーID'].value;
            const userName = user['ユーザー名'] && user['ユーザー名'].value;
            if (userId) {
                userMap.set(userId, userName || '');
            }
        });

        for (const integrationKey of integrationKeys) {
            const integratedRecord = {};

            // 各台帳からこの統合キーに対応するレコードを取得
            let recordUserId = null;
            
            for (const [appId, records] of Object.entries(allLedgerData)) {
                const matchingRecord = records.find(record => {
                    const keyField = record[CONFIG.integrationKey];
                    return keyField && keyField.value === integrationKey;
                });

                const appConfig = CONFIG.apps[appId];
                const ledgerName = appConfig.name;
                const displayFields = CONFIG.getDisplayFields(appId);
                
                if (matchingRecord) {
                    // レコードが存在する場合、displayFieldsで指定されたフィールドを追加
                    displayFields.forEach(fieldCode => {
                        const fieldValue = matchingRecord[fieldCode];
                        const displayValue = fieldValue && fieldValue.value !== undefined 
                            ? fieldValue.value 
                            : fieldValue;
                        
                        integratedRecord[`${ledgerName}_${fieldCode}`] = displayValue;
                        
                        // ユーザーIDを記録
                        if (fieldCode === 'ユーザーID' && displayValue) {
                            recordUserId = displayValue;
                        }
                    });
                    
                    // レコードIDを追加（保存処理で使用するため）
                    const recordIdField = matchingRecord['$id'];
                    const recordIdValue = recordIdField && recordIdField.value !== undefined 
                        ? recordIdField.value 
                        : recordIdField;
                    integratedRecord[`${ledgerName}_$id`] = recordIdValue;
                    
                    // 統合キーも追加（マージ処理で使用するため）
                    const integrationKeyField = matchingRecord[CONFIG.integrationKey];
                    const integrationKeyValue = integrationKeyField && integrationKeyField.value !== undefined 
                        ? integrationKeyField.value 
                        : integrationKeyField;
                    integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`] = integrationKeyValue;
                } else {
                    // レコードが存在しない場合、displayFieldsのフィールドをnullで埋める
                    displayFields.forEach(fieldCode => {
                        integratedRecord[`${ledgerName}_${fieldCode}`] = null;
                    });
                    
                    // レコードIDもnullで追加
                    integratedRecord[`${ledgerName}_$id`] = null;
                    
                    // 統合キーもnullで追加
                    integratedRecord[`${ledgerName}_${CONFIG.integrationKey}`] = null;
                }
            }

            // ユーザーリストからユーザー名を取得してPC台帳のデータとして設定
            if (recordUserId && userMap.has(recordUserId)) {
                integratedRecord['PC台帳_ユーザー名'] = userMap.get(recordUserId);
            } else {
                integratedRecord['PC台帳_ユーザー名'] = null;
            }

            integratedData.push(integratedRecord);
        }

        return integratedData;
    }

    /**
     * 2つの統合データをマージ（重複を除外）
     * 統合キーが同じレコードは重複とみなし、新しいデータを優先
     */
    mergeIntegratedData(existingData, newData) {
        if (!existingData || existingData.length === 0) {
            return newData;
        }
        
        if (!newData || newData.length === 0) {
            return existingData;
        }

        // 既存データの統合キーをセットで管理（高速検索のため）
        const existingKeys = new Set();
        const mergedData = [...existingData];

        // 既存データから統合キーを抽出
        existingData.forEach(record => {
            // 統合キーを各台帳のフィールドから探す
            const integrationKey = this.extractIntegrationKeyFromRecord(record);
            if (integrationKey) {
                existingKeys.add(integrationKey);
            }
        });

        // 新しいデータから重複していないものを追加
        newData.forEach(record => {
            const integrationKey = this.extractIntegrationKeyFromRecord(record);
            
            if (integrationKey) {
                // 統合キーが存在する場合の重複チェック
                if (!existingKeys.has(integrationKey)) {
                    mergedData.push(record);
                    existingKeys.add(integrationKey);
                    console.log(`✅ 新規レコード追加: 統合キー=${integrationKey}`);
                } else {
                    console.log(`❌ 重複レコード除外: 統合キー=${integrationKey}`);
                }
            } else {
                // 統合キーがnullの場合は、とりあえず追加
                mergedData.push(record);
            }
        });
        
        return mergedData;
    }

    /**
     * 統合レコードから統合キーを抽出
     * 各台帳のフィールドから統合キーに対応する値を探す
     */
    extractIntegrationKeyFromRecord(record) {
        // 各台帳から統合キーを探す
        for (const [appId, appConfig] of Object.entries(CONFIG.apps)) {
            const ledgerName = appConfig.name;
            const keyFieldName = `${ledgerName}_${CONFIG.integrationKey}`;
            
            if (record[keyFieldName] && record[keyFieldName] !== null) {
                return record[keyFieldName];
            }
        }
        
        return null;
    }
}

// グローバルに公開
window.DataIntegrator = DataIntegrator; 