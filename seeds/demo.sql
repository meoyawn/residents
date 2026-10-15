PRAGMA foreign_keys = ON;

INSERT INTO collections(id,name,city,created_at) VALUES
('example-house','Примерный дом','Примерск','2025-01-01T00:00:00.000Z'),
('demo-block','Демонстрационный квартал','Примерск','2025-01-02T00:00:00.000Z') ON CONFLICT DO NOTHING;
INSERT INTO buildings(id,collection_id,name,address,apartments_count) VALUES
('example-house-1','example-house','Примерная, 1','ул. Примерная, 1',160),
('demo-block-1','demo-block','Демонстрационная, 1','ул. Демонстрационная, 1',120),
('demo-block-2','demo-block','Демонстрационная, 2','ул. Демонстрационная, 2',120),
('demo-block-3','demo-block','Демонстрационная, 3','ул. Демонстрационная, 3',120),
('demo-block-4','demo-block','Демонстрационная, 4','ул. Демонстрационная, 4',120) ON CONFLICT DO NOTHING;
INSERT INTO users(id,phone,name,is_webmaster) VALUES
('demo-webmaster','+12025550101','Webmaster · демо',1),
('demo-resident','+12025550102','Алексей · демо',0),
('demo-admin','+12025550103','Анна · демо',0),
('demo-4','+12025550104','Ирина · демо',0),
('demo-5','+12025550105','Михаил · демо',0),
('demo-6','+12025550106','Ольга · демо',0),
('demo-7','+12025550107','Дмитрий · демо',0),
('demo-8','+12025550108','Елена · демо',0),
('demo-pending','+12025550109','Новый сосед · демо',0) ON CONFLICT DO NOTHING;
INSERT INTO memberships(building_id,user_id,role,status,apartment,entrance,verified_at) VALUES
('example-house-1','demo-resident','resident','verified','101','4',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('example-house-1','demo-admin','admin','verified','42','2',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('example-house-1','demo-4','resident','verified','105','4',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('example-house-1','demo-5','resident','verified','18','1',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('example-house-1','demo-6','resident','verified',NULL,'3',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('example-house-1','demo-7','resident','verified','80','3',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('example-house-1','demo-8','resident','verified','135','4',strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('example-house-1','demo-pending','resident','pending',NULL,NULL,NULL),
('demo-block-1','demo-resident','resident','verified',NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT DO NOTHING;
INSERT INTO collection_admins(collection_id,user_id) VALUES('demo-block','demo-admin') ON CONFLICT DO NOTHING;
INSERT INTO problems(id,building_id,title,description,category,status,created_by,deadline,outcome,created_at) VALUES
('gate','example-house-1','Удобный проход во двор','Вымышленный пример: сравним варианты удобного прохода во двор, включая доступ с коляской. Все обстоятельства, сметы и голоса в этом примере придуманы.','access','open','demo-admin',strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days'),NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
('path','example-house-1','Удобная дорожка к парковке','Вымышленный пример планирования дорожки: сравним материалы, доступность и стоимость. Цены и потребности демонстрационного дома придуманы.','yard','open','demo-resident',strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 days'),NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')),
('cleaning','example-house-1','Регулярная уборка подъездов','Вымышленный пример: выберем график уборки общих помещений и способ проверки качества.','maintenance','discussion','demo-4',NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
('garden','example-house-1','Уход за общими клумбами','Вымышленный пример: сравним варианты растений и графики полива для демонстрационного двора.','safety','discussion','demo-7',NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days')),
('asphalt','example-house-1','План весеннего осмотра двора','Вымышленный пример: составим перечень общих зон для сезонного осмотра.','yard','discussion','demo-6',NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days')),
('hall-light','example-house-1','Освещение холла обновлено','Вымышленный пример завершённой работы: в демонстрационном холле установлены новые лампы.','maintenance','resolved','demo-admin',NULL,'Демонстрационный результат: выбраны энергосберегающие лампы. Все работы и обстоятельства вымышлены.',strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 days')),
('cluster-light','demo-block-1','Освещение пешеходного прохода','Первый демонстрационный вопрос отдельного дома в квартале. Администратор группы управляет всеми четырьмя домами, а голосуют только подтверждённые жители этого дома.','safety','discussion','demo-resident',NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT DO NOTHING;
INSERT INTO options(id,problem_id,building_id,title,description,price_kopecks,cost_note,created_by) VALUES
('gate-key','gate','example-house-1','Калитка с электронным ключом','Проход шириной 1,2 м, доступ по ключу домофона. Подходит для детских и инвалидных колясок.',4800000,'Пример сметы · нужно предложение подрядчика','demo-admin'),
('gate-open','gate','example-house-1','Оставить проход открытым','Убрать секцию забора и сохранить свободный выход. Работа и вывоз металла.',800000,'Пример сметы · нужно предложение подрядчика','demo-admin'),
('gate-closed','gate','example-house-1','Сохранить закрытый забор','Оставить текущее состояние. Выход во двор с другой стороны дома.',0,'Без дополнительных работ','demo-admin'),
('path-gravel','path','example-house-1','Дорожка из щебня','Подготовка основания, геотекстиль и щебень.',3200000,'Пример сметы · нужно предложение подрядчика','demo-admin'),
('path-paving','path','example-house-1','Дорожка из брусчатки','Ровное мощение шириной 1,5 м, удобное для колясок.',7600000,'Пример сметы · нужно предложение подрядчика','demo-admin'),
('path-wait','path','example-house-1','Отложить работы','Сначала запросить решение управляющей компании.',0,'Без дополнительных работ','demo-admin') ON CONFLICT DO NOTHING;
INSERT INTO votes(problem_id,building_id,user_id,option_id,version) VALUES
('gate','example-house-1','demo-4','gate-key',1),
('gate','example-house-1','demo-5','gate-key',1),
('gate','example-house-1','demo-6','gate-open',1),
('gate','example-house-1','demo-7','gate-closed',1),
('gate','example-house-1','demo-8','gate-key',1),
('path','example-house-1','demo-4','path-paving',1),
('path','example-house-1','demo-5','path-gravel',1) ON CONFLICT DO NOTHING;
INSERT INTO comments(id,problem_id,building_id,user_id,body,created_at) VALUES
('demo-comment-1','gate','example-house-1','demo-4','Давайте учтём ширину прохода: важно, чтобы коляска проезжала без препятствий. Это пример комментария.',strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 hours')),
('demo-comment-2','gate','example-house-1','demo-5','Калитка выглядит разумным компромиссом. Хотелось бы сначала получить точную смету от подрядчика.',strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour')),
('demo-comment-3','path','example-house-1','demo-4','Брусчатка удобнее для колясок. Предлагаю проверить, входит ли подготовка основания в цену.',strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 hours')) ON CONFLICT DO NOTHING;
INSERT INTO audit_events(id,building_id,actor_id,action,entity_id,detail,created_at) VALUES
('demo-audit-1','example-house-1','demo-admin','problem_created','gate','Демонстрационный вопрос об удобном проходе во двор',strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 hours')),
('demo-audit-2','example-house-1','demo-admin','status_changed','hall-light','Освещение холла обновлено. Наблюдаем в течение недели.',strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 hours')) ON CONFLICT DO NOTHING;
