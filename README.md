# squelize-socket-interface

### example

```node
const Client = require('sequelize-socket-interface');

router.get('/students/{student_id}/parents/', function(req, res) {
  let clientModel = new Client(3000); // takes the same parameters as Socket.prototype.connect
  
  clientModel.MySql({
    tenant: 'cowichan-secondary',
    model: 'Student',
    method: 'findById',
    params: req.params.student_id
  }).then(response => { // response is the object returned by student.get()
    return clientModel.data({ // .data for an instance, .dataSets for array of instances from findAll() for ex.
      tenant: 'cowichan-secondary',
      model: 'student', // follows the convention of instances starting with lower-case letter (I should change this)
      method: 'getParents',
      params: []
    });
  }).then(parents => {
    if (!parents.length) {
      return res.sendStatus(404);
    } 
    
    return res.json(parents);
  });
});
```
