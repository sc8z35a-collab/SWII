import {buildHuman} from './human-model.js';
import {buildCar} from './car-model.js';

const pack=(key,mesh)=>({key,mesh:{vertices:mesh.vertices,indices:mesh.indices}});
// Low-detail bodies first so people appear quickly, then the close-up meshes.
export function* buildModels(){
  yield [pack('human0-0',buildHuman(0,0)),pack('human1-0',buildHuman(1,0)),pack('human2-0',buildHuman(2,0)),pack('car-0',buildCar(0))];
  yield [pack('car-1',buildCar(1))];
  for(const variant of [0,1,2])yield [pack('human'+variant+'-1',buildHuman(variant,1))];
}
if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope){
  for(const meshes of buildModels()){
    const transfer=meshes.flatMap(({mesh})=>[mesh.vertices.buffer,mesh.indices.buffer]);
    self.postMessage({meshes,done:false},transfer);
  }
  self.postMessage({meshes:[],done:true});
}
