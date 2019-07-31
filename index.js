"use strict";
const functions = require("firebase-functions");
const { WebhookClient } = require("dialogflow-fulfillment");
const { OAuth2Client } = require("google-auth-library");

const { CONSTANTS } = require("./constants.js");

const admin = require("firebase-admin");
admin.initializeApp(functions.config().firebase);
const db = admin.firestore();
process.env.DEBUG = "dialogflow:debug"; // enables lib debugging statements
const CLIENT_ID = `175358857855-ur95gp21umm1sqolmahnhb16cdhhk6fb.apps.googleusercontent.com`;
const client = new OAuth2Client(CLIENT_ID);

const { Database, Auth, Util } = require("./helper");
let db_helper = new Database(db);
let util = new Util();
const updateEntityHelper = require('./update')

function getUserInfo(agent) {
  let parameters = agent.context.get("user_info").parameters;
  if (!parameters) {
    let user = util.extractDataFromToken(agent);
    if (!user) {
      util.saveUserInfo(agent, user);
    } else {
      console.error("Invalid User, From Token!");
      agent.add(`Trouble Extracting User Details, not a valid user`);
    }
  }
  return parameters;
}

function helpMessage(agent) {
  agent.add(`Here are things you can ask me, What is everyone doing?
   Add New Family Member
   Whats up with Jackson?`);
}

function welcome(agent) {
  async function verify(token) {
    const ticket = await client.verifyIdToken({
      idToken: token, // <-- this comes from: conv.user.profile.token
      audience: CLIENT_ID // Specify the CLIENT_ID of the app that accesses the backend
      // Or, if multiple clients access the backend:
      //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
    });
    const payload = ticket.getPayload();
    let user = {
      username: payload["name"],
      given_name: payload["given_name"],
      family_name: payload["family_name"],
      picture: payload["picture"],
      email_verified: payload["email_verified"],
      email: payload["email"]
    };
    util.saveUserInfo(agent, user);
    let valid = await db_helper.checkIfValidUser(user.email);

    if (valid) {
      agent.add(`Welcome Back ${user.given_name}!`);
      // helpMessage(agent);
      let updateEntity = await db_helper.updateSessionEntities(agent,user.email)

      let reqUser = await db_helper.checkifFamilyRequests(user.email);

      if (reqUser.empty) {
        console.log(`No Requests Available!`);
      } else {
        // notify the request
        agent.add(`You have a new Family Request`);
      }


    } else {
      agent.add("Thanks for Signing Up!");
      await db_helper.registerUser(user);
      helpMessage(agent);
    }
  }

  let conv = agent.conv();
  let token = conv.user.profile.token;
  return verify(token).catch(console.error);
}

function fallback(agent) {
  agent.add(`I didn't understand`);
  agent.add(`I'm sorry, can you try again?`);
}

function add_new_member(agent) {
  let email = agent.parameters.email;
  agent.add(`you friend's emailid is ${email}. did i catch that right?`);
  util.setContextWithParameters(agent, "save-email", 10, {
    email: email
  });
}

function add_new_member_yes(agent) {
  let email = util.getContextWithParameters(agent, "addnewmember-followup")
    .email;
  let valid = db_helper.checkIfValidUser(email);

  if (valid) {
  

    let currentUser = getUserInfo(agent);
    let reqResult = db_helper.sendFamilyRequest(email, {
      name: currentUser.username,
      email: currentUser.email
    });
    agent.add(`Request Sent!`);
  } else {
    agent.add(`I couldn't find any user with ${email}, enter correct one! `);
  }
}

function add_new_member_no(agent) {
  agent.add("No? Okay. Tell me the right email id");
}

function sign_in_result(agent) {
  // async function verify() {
  //   const ticket = await client.verifyIdToken({
  //       idToken: token,  // <-- this comes from: conv.user.profile.token
  //       audience: CLIENT_ID,  // Specify the CLIENT_ID of the app that accesses the backend
  //       // Or, if multiple clients access the backend:
  //       //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
  //   });
  //   const payload = ticket.getPayload();
  //   const userid = payload['sub'];
  //   agent.add(userid)
  // }

  // let conv = agent.conv();
  // let token = conv.user.profile.token;
  // verify().catch(console.error);
  agent.add("This is Result Intent, invoked when sign in done dynamically");
}

function sign_in_request(agent) {}

function updateUserStatus(agent) {
  let status = agent.parameters.status;
  agent.add(`Status is ${status}. did i catch that right?`);
  util.setContextWithParameters(agent, "save-status", 10, {
    status: status
  });
}

function status_update_yes(agent) {
  let user = getUserInfo(agent);
  let author = user.email;
  let status = util.getContextWithParameters(agent, "save-status").status;
  let name = user.username;
  let result = db_helper.addNewStatus(author, name, status);

  if (result !== null) {
    agent.add(`Status Updated!`);
  } else {
    agent.add("Trouble Updating Status, Try Again Later!");
  }
}

function status_update_no(agent) {
  agent.add("Sorry,Say it Again Please");
}

function respondToStatus(agent) {}

function deleteMember(agent) {
  let email = agent.parameters.email;
  agent.add(`the emailid is ${email}. did i catch that right?`);
  util.setContextWithParameters(agent, "save-email", 10, {
    email: email
  });
}

async function deleteMember_yes(agent) {
  let current_user_email = getUserInfo(agent).email;
  let delete_user_email = util.getContextWithParameters(agent, "save-email")
    .email;

  let deleteResult = await db_helper.deleteMember_db(
    current_user_email,
    delete_user_email
  );
  if (!deleteResult) {
    agent.add(`Trouble Removing Friend`);
  } else {
    agent.add(`Done`);
  }
}

function deleteMember_no(agent) {}

function respondToStatus_context(agent) {}

async function feed_intent(agent) {
  let current_user_email = getUserInfo(agent).email;

  try {
    // construct feed at readtime
    let feed_construction = await db_helper.constructFeed(current_user_email);
    if (!feed_construction) {
      agent.add(`You havn't added any family yet!`);
      return;
    }

    // get the first item in the feed
    let first_post = await db_helper.getFirstFeedPost(current_user_email);

    if (!first_post) {
      agent.add(
        `You don't have any New Updates at the moment, Do you want me fetch already listened posts one more time?`
      );
      util.setFilterContext(
        agent,
        CONSTANTS.FETCH_ALREADY_POSTS_FILTER,
        5,
        null
      );
      return;
    }

    let post_doc = await db_helper.getPostWithDocumentId(
      first_post.data().postid
    );
    let name = post_doc.data().name;
    let status = post_doc.data().status;
    agent.add(`${name} says    ${status}`);

    let feed_doc_id = first_post.id;
    await db_helper.updatePostToRead(current_user_email, feed_doc_id);

    //put post doc_id in context
    util.setContextWithParameters(
      agent,
      CONSTANTS.NEXT_POST_PRESENT_DOCUMENT_ID,
      10,
      {
        doc_id: feed_doc_id
      }
    );

    util.setContextWithParameters(
      agent,
      CONSTANTS.ALREADY_READ_NEXT_POST_PRESENT_DOC_ID,
      0,
      null
    );

    util.setFilterContext(agent, CONSTANTS.NEXT_STATUS_FILTER, 5, null);
  } catch (error) {
    console.error(error);
    agent.add(`oh! oh!. something went wrong`);
  }
}

async function next_post_intent(agent) {
  let current_user_email = getUserInfo(agent).email;

  let count_context_not_read = util.getContext(
    agent,
    CONSTANTS.NEXT_POST_PRESENT_DOCUMENT_ID
  );
  let count_context_already_read = util.getContext(
    agent,
    CONSTANTS.ALREADY_READ_NEXT_POST_PRESENT_DOC_ID
  );
  try {
    if (count_context_not_read) {
      // next means go next() on not read posts

      let doc_id = count_context_not_read.parameters.doc_id;
      // get the first item in the feed
      let post = await db_helper.getFeedPostWithIndex(
        current_user_email,
        doc_id
      );

      if (!post) {
        agent.add(
          `thats all. you don't have anymore new updates,do want me fetch already listened updates one more time?`
        );
        util.setFilterContext(
          agent,
          CONSTANTS.FETCH_ALREADY_POSTS_FILTER,
          5,
          null
        );
        util.setFilterContext(agent, CONSTANTS.NEXT_STATUS_FILTER, 0, null);
        return;
      }

      let post_doc = await db_helper.getPostWithDocumentId(post.data().postid);
      let name = post_doc.data().name;
      let status = post_doc.data().status;
      agent.add(`${name} says    ${status}`);

      let feed_doc_id = post.id;
      await db_helper.updatePostToRead(current_user_email, feed_doc_id);

      //put post count in context
      util.setContextWithParameters(agent, CONSTANTS.NEXT_POST_COUNT, 10, {
        count: post_index
      });
      util.setFilterContext(agent, CONSTANTS.NEXT_STATUS_FILTER, 5, null);
    } else if (count_context_already_read) {
      // here next means go next on already read posts

      let doc_id = count_context_already_read.parameters.doc_id;
      let post = await db_helper.getALreadyReadFeedPostWithIndex(
        current_user_email,
        doc_id
      );
      if (!post) {
        agent.add(`thats all. you have listened to all of them`);
        util.setFilterContext(agent, CONSTANTS.NEXT_STATUS_FILTER, 0, null);
        return;
      }

      let post_doc = await db_helper.getPostWithDocumentId(post.data().postid);
      let name = post_doc.data().name;
      let status = post_doc.data().status;
      agent.add(`${name} says    ${status}`);

      let feed_doc_id = post.id;

      //put post count in context
      util.setContextWithParameters(
        agent,
        CONSTANTS.ALREADY_READ_NEXT_POST_PRESENT_DOC_ID,
        10,
        {
          doc_id: feed_doc_id
        }
      );
      util.setFilterContext(agent, CONSTANTS.NEXT_STATUS_FILTER, 5, null);
    } else {
      agent.add(`I dont know what you mean by Next, report a bug?`);
    }
  } catch (error) {
    console.error(error);
    agent.add(`oh! oh!. something went wrong`);
  }
}

async function feed_post_fetch_read_yes(agent) {
  let current_user_email = getUserInfo(agent).email;

  try {
    // get the first item in the feed
    let first_post = await db_helper.getAlreadyReadFirstFeedPost(
      current_user_email
    );

    if (!first_post) {
      agent.add(`You don't have any Updates at the moment`);
      return;
    }

    let post_doc = await db_helper.getPostWithDocumentId(
      first_post.data().postid
    );
    let name = post_doc.data().name;
    let status = post_doc.data().status;
    agent.add(`${name} says    ${status}`);

    let feed_doc_id = post_doc.id;
    //put post doc_id in context
    util.setContextWithParameters(
      agent,
      CONSTANTS.ALREADY_READ_NEXT_POST_PRESENT_DOC_ID,
      10,
      {
        doc_id: feed_doc_id
      }
    );

    util.setContextWithParameters(
      agent,
      CONSTANTS.NEXT_POST_PRESENT_DOCUMENT_ID,
      0,
      null
    );
    util.setFilterContext(agent, CONSTANTS.NEXT_STATUS_FILTER, 5, null);
  } catch (error) {
    console.error(error);
    agent.add(`oh! oh!. something went wrong`);
  }
}

async function family_request_enqiry(agent) {
  let current_user_email = getUserInfo(agent).email;

  let list = await db_helper.checkifFamilyRequests(current_user_email);

  if (list.empty) {
    agent.add(`You don't have any requests at the moment`);
    return;
  }
  let req_list = [];
  list.forEach(item => {
    req_list.push({
      name: item.data().name,
      email: item.data().email
    });
  });

  let item = req_list[0];
  util.setContextWithParameters(agent, CONSTANTS.REQUEST_LIST_DB, 10, {
    list: req_list,
    count: req_list.length
  });

  util.setFilterContext(
    agent,
    CONSTANTS.NEED_REQUEST_ACCEPT_CONFIRMATION_FILTER,
    10,
    {
      email: item.email
    }
  );

  agent.add(`you have a request from ${item.name} with email ${item.email}`);
}



async function accept_familty_request_confirm(agent) {
  let current_user_email = getUserInfo(agent).email;
  let req_confirm_email = util.getFilterContext(
    agent,
    CONSTANTS.NEED_REQUEST_ACCEPT_CONFIRMATION_FILTER
  ).parameters.email;
  let result = await db_helper.addToFamilyList(
    current_user_email,
    req_confirm_email
  );
  if (result) {
    agent.add(`Added to Family List`);
    
  } else {
    agent.add(`Trouble Adding to List`);
  }

  // remove from request list
  let remove_from_req = await db_helper.removeFromReqList(
    current_user_email,
    req_confirm_email
  );
  if (remove_from_req) {
    console.log(`Removed From Req List`);
  } else {
    console.log(`Trouble Removing From List to List`);
  }
}

async function person_status(agent)
{
  let person_email = agent.parameters.FamilyName;
  let status = await db_helper.getIndividualStatus(person_email)
  console.log('fasdfafafaf'+person_email)
  let first_status = status
  let p_status = first_status.data().status;
  let name = first_status.data().name;
  agent.add(`${name} says,  ${p_status}`)
}


let intentMap = new Map();
intentMap.set("Default Welcome Intent", welcome);
intentMap.set("Default Fallback Intent", fallback);
intentMap.set("Add New Member", add_new_member);
intentMap.set("Add New Member - yes", add_new_member_yes);
intentMap.set("Add New Member - no", add_new_member_no);
intentMap.set("Sign In Result", sign_in_result);
intentMap.set("Sign In", sign_in_request);
intentMap.set("Status Update", updateUserStatus);
intentMap.set("Status Update - yes", status_update_yes);
intentMap.set("Status Update - no", status_update_no);
intentMap.set("Status Respond - context", respondToStatus_context); //suffix word "context" means this intent is triggered
//  only when its context is active
intentMap.set("Feed Intent", feed_intent);
intentMap.set("Delete Member", deleteMember);
intentMap.set("Delete Member - yes", deleteMember_yes);
intentMap.set("Delete Member - no", deleteMember_no);

intentMap.set("Family Request", family_request_enqiry);
intentMap.set("Accept Request-Confirm", accept_familty_request_confirm);

intentMap.set("Next Post", next_post_intent);

// intentMap.set('Feed Intent Read Posts - no', feed_post_fetch_read_no)

intentMap.set("Feed Intent Read Posts - yes", feed_post_fetch_read_yes);
intentMap.set("Person Status",person_status)

exports.familyTimeFullfillment = functions.https.onRequest(
  (request, response) => {
    const agent = new WebhookClient({
      request,
      response
    });

    agent.handleRequest(intentMap);
  }
);

