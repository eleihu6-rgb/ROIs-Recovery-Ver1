#ifndef _TESTHTTPCLIENT_H_
#define _TESTHTTPCLIENT_H_

#include "oatpp/web/client/ApiClient.hpp"


/* Begin Api Client code generation */
#include OATPP_CODEGEN_BEGIN(ApiClient)

/**
 * Test API client.
 * Use this client to call application APIs.
 */
class TestHttpClient : public oatpp::web::client::ApiClient {

	API_CLIENT_INIT(TestHttpClient)

		/*****************************************************************
		 * HttpController
		 *****************************************************************/

		API_CALL("GET", "/test", test)

		/*****************************************************************/

		// TODO - add more client API calls here

};

/* End Api Client code generation */
#include OATPP_CODEGEN_END(ApiClient)


#endif //_TESTHTTPCLIENT_H_