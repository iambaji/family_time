'use strict';

const dialogflow = require('dialogflow');

const credentials = require('./credentials.json');

//no credentials requeired since firebase functions will authenticate for us
const client = new dialogflow.SessionEntityTypesClient({
  credentials:credentials
});

const projectId = 'familytime-ae6cf';

class EntityNotFoundError extends Error {}
module.exports = {

  async updateSessionEntity(agent,entity_Type, entries){
    const sessionEntityTypeName = `${agent.session}/entityTypes/${entity_Type}`;

    const sessionEntityType = {
      name: sessionEntityTypeName,
      entityOverrideMode: 'ENTITY_OVERRIDE_MODE_OVERRIDE',
      entities: entries,
    };

    const request = {
      parent: agent.session,
      sessionEntityType: sessionEntityType,
    };

    
    try {
      let responses = await client.createSessionEntityType(request)
        console.log('Successfully created session entity type:',
        JSON.stringify(request));

    } catch (error) {
      console.error('Error creating session entitytype: ', error);
      
    }



  }







    // async getEntity(entity_name){
    //   let entityTypes = await entitiesClient
    //   .listEntityTypes({parent: agentPath})
    //   try {
        
    //     // The array of EntityTypes is the 0th element of the response.
    //     const types = entityTypes[0];
    //     for (let i = 0; i < types.length; i++) {
    //       const entity = types[i];
    //       if (entity.displayName === entity_name) {
    //         return entity;
    //       }
    //     }
    //     throw new EntityNotFoundError();
    //   } catch (error) {
    //     console.error(error)
    //     return null
    //   }

    // },

    // async updateEntity(entityName,listofFamilyNames){
    //   try {
    //     let entity = await this.getEntity(entityName)
    //     if(!entity){throw EntityNotFoundError();}
    //     else{
    //       listofFamilyNames.for
    //     }
    //   } catch (error) {
    //     console.error(error)
    //   }
       
    // }
}

