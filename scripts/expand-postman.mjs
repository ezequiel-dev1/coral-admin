import fs from 'node:fs';
const file = new URL('../postman/uber-eats-sandbox.postman_collection.json', import.meta.url);
const c = JSON.parse(fs.readFileSync(file, 'utf8'));
const token = c.item[0];
const originalOrder = c.item.find(x => x.name === '2. Get Order') ?? c.item.find(x => x.name.startsWith('Orders')).item[0];
token.request.body.formdata.find(x => x.key === 'scope').value = '{{scopes}}';
const base = 'https://test-api.uber.com';
function request(name, method, path, body, description = '') {
  return { name, request: { method, header: [{key:'Content-Type',value:'application/json'}], url: base + path,
    description, ...(body === undefined ? {} : {body:{mode:'raw',raw:typeof body === 'string' ? body : JSON.stringify(body,null,2),options:{raw:{language:'json'}}}}) },
    event:[{listen:'test',script:{type:'text/javascript',exec:["pm.test('Successful response', () => pm.expect(pm.response.code).to.be.within(200, 299));"]}}],response:[] };
}
const menu = {
  menus:[{id:'coral-test-menu',title:{translations:{es_mx:'Coral Sandbox'}},service_availability:['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day_of_week=>({day_of_week,time_periods:[{start_time:'00:00',end_time:'23:59'}]})),category_ids:['coral-test-category']}],
  categories:[{id:'coral-test-category',title:{translations:{es_mx:'Pruebas'}},entities:[{id:'coral-test-item',type:'ITEM'}]}],
  items:[{id:'coral-test-item',title:{translations:{es_mx:'Platillo de prueba'}},price_info:{price:10000},quantity_info:{quantity:{max_permitted:10}},tax_info:{tax_rate:0}}],modifier_groups:[]
};
c.variable.push(...[
 ['store_id',''],['item_id','coral-test-item'],['scopes','eats.order eats.store eats.store.orders.read eats.store.status.write'],
 ['item_price_minor','10000'],['paused_until',''],['menu_payload',JSON.stringify(menu,null,2)]
].map(([key,value])=>({key,value,type:'string'})));
c.item = [token,
 {name:'Stores',item:[
 request('List Authorized Stores — find store_id','GET','/v1/eats/stores?limit=50',undefined,'Scope eats.store. Copy stores[].store_id to the collection store_id variable. If empty, ask Uber Integration Tech Support to provision a sandbox store for this application. Paginate with start_key using response next_key. Source: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores'),
 request('Get Store — sandbox guide','GET','/v1/delivery/stores/{{store_id}}',undefined,'Requires a provisioned sandbox store. Source: https://developer.uber.com/docs/eats/guides/sandbox'),
 request('Get Integration Details','GET','/v1/eats/stores/{{store_id}}/pos_data',undefined,'Scope eats.store. Source: https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores-storeid-posdata'),
 request('Set Store Online','POST','/v1/eats/store/{{store_id}}/status',{status:'ONLINE',reason:'Coral sandbox testing'},'Scope eats.store.status.write. Source: https://developer.uber.com/docs/eats/references/api/v1/post-eats-stores-storeid-status'),
 request('Pause Store','POST','/v1/eats/store/{{store_id}}/status',{status:'PAUSED',paused_until:'{{paused_until}}',reason:'Coral sandbox testing'},'Set paused_until to a future ISO timestamp. Scope eats.store.status.write.'),
 request('Update Store Status — guide template','PATCH','/v1/eats/stores/{{store_id}}/status','{{store_status_payload}}','The sandbox guide supplies no body schema. Set store_status_payload to a JSON payload confirmed by Uber for this endpoint. Prefer the reference-backed POST requests above.')
 ]},
 {name:'Menus',item:[
 request('Get Menu','GET','/v2/eats/stores/{{store_id}}/menus',undefined,'Scope eats.store. See https://developer.uber.com/docs/eats/guides/menu-integration'),
 request('Upload Sample Menu — replaces existing menu','PUT','/v2/eats/stores/{{store_id}}/menus','{{menu_payload}}','Replaces the entire sandbox store menu. Review menu_payload first. Source: https://developer.uber.com/docs/eats/references/api/v2/put-eats-stores-storeid-menu'),
 request('Update Item Price','POST','/v2/eats/stores/{{store_id}}/menus/items/{{item_id}}','{"price_info":{"price":{{item_price_minor}}}}','Price is in minor currency units. Scope eats.store. Source: https://developer.uber.com/docs/eats/references/api/v2/post-eats-stores-storeid-menus-items-itemid'),
 request('Upload Menu — sandbox guide variant','POST','/v1/delivery/stores/{{store_id}}/menus','{{menu_payload}}','Legacy/example route from sandbox guide; use the v2 PUT request if this route is unsupported.')
 ]},
 {name:'Orders — run lifecycle actions individually',item:[
 originalOrder,
 request('Get Order v2','GET','/v2/eats/order/{{order_id}}',undefined,'Scope eats.order or eats.store.orders.read. Source: https://developer.uber.com/docs/eats/references/api/v2/get-eats-order-orderid'),
 request('Accept Order','POST','/v1/eats/orders/{{order_id}}/accept_pos_order',{reason:'Coral sandbox acceptance',external_reference_id:'coral-postman-test'},'Requires nominated order-manager app. Source: https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-acceptposorder'),
 request('Accept Order — sandbox guide variant','POST','/v1/delivery/orders/{{order_id}}/accept_pos_order',undefined,'Exact sandbox guide example. Scope eats.order.'),
 request('Deny Order','POST','/v1/eats/orders/{{order_id}}/deny_pos_order',{reason:{explanation:'Coral sandbox denial test',code:'OTHER'}},'Use a different pending test order from acceptance. Requires order-manager app. Source: https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-denyposorder'),
 request('Cancel Order','POST','/v1/eats/orders/{{order_id}}/cancel',{reason:'OTHER',details:'Coral sandbox cancellation test'},'Requires an order that is not terminal. Source: https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-cancel')
 ]}
];
c.variable.push({key:'store_status_payload',value:'',type:'string'});
c.info.description = 'Uber Eats sandbox testing for Coral. Source: https://developer.uber.com/docs/eats/guides/sandbox . Includes every outbound operation shown in that guide plus detailed-reference alternatives for stores, menus and order lifecycle. Guide variants are explicitly labeled because their routes differ from detailed references. Enter credentials privately in Postman. Run token first; then select requests individually, not the whole collection: online/pause and accept/deny/cancel are alternative state transitions. Set store_id and order_id from Uber-provided test data. Sandbox support can depend on provisioning and scopes; a 404 on a guide variant does not establish that a canonical route works. Webhook receipt requires a running receiver and a test order placed through Uber; this collection does not manufacture Uber orders or send fake notifications to Coral.';
fs.writeFileSync(file, JSON.stringify(c,null,2)+'\n');
console.log('Expanded sandbox collection.');
