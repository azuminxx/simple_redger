(function() {
    'use strict';

    kintone.events.on('app.record.index.show', function(event) {

        if (event.viewName != 'カスタマイズビュー') {
            return;
        }
        // カスタマイズビューが表示されたときの処理
        console.log('シンプル台帳 - カスタマイズビューが表示されました');

        
        return event;
    });

})(); 