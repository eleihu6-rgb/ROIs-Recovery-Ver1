
#ifndef _HTTPCOMPONENT_H_
#define _HTTPCOMPONENT_H_

#ifndef MONGOOSE

#ifdef OATPP_SYNC_API
#include "oatpp/web/server/HttpConnectionHandler.hpp"
#else
#include "oatpp/web/server/AsyncHttpConnectionHandler.hpp"
#endif //OATPP_SYNC_API
#include "oatpp/web/server/HttpRouter.hpp"
#include "oatpp/network/tcp/server/ConnectionProvider.hpp"
#include "oatpp/parser/json/mapping/ObjectMapper.hpp"
#include "oatpp/core/macro/component.hpp"

#include "configParam.h"



#ifdef OATPP_SYNC_API
class AppComponent {
public:

	/**
	 *  Create ConnectionProvider component which listens on the port
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::network::ServerConnectionProvider>, serverConnectionProvider)([] {
		return oatpp::network::tcp::server::ConnectionProvider::createShared({ "0.0.0.0", static_cast<v_uint16>(std::stoi(g_port)), oatpp::network::Address::IP_4 });
		}());

	/**
	 *  Create Router component
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, httpRouter)([] {
		return oatpp::web::server::HttpRouter::createShared();
		}());

	/**
	 *  Create ConnectionHandler component which uses Router component to route requests
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::network::ConnectionHandler>, serverConnectionHandler)([] {
		OATPP_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, router); // get Router component
		return oatpp::web::server::HttpConnectionHandler::createShared(router);
		}());

	/**
	 *  Create ObjectMapper component to serialize/deserialize DTOs in Contoller's API
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::data::mapping::ObjectMapper>, apiObjectMapper)([] {
		auto serializerConfig = oatpp::parser::json::mapping::Serializer::Config::createShared();
		auto deserializerConfig = oatpp::parser::json::mapping::Deserializer::Config::createShared();
		deserializerConfig->allowUnknownFields = false;
		auto objectMapper = oatpp::parser::json::mapping::ObjectMapper::createShared(serializerConfig, deserializerConfig);
		return objectMapper;
		}());

};

#else

/**
 *  Class which creates and holds Application components and registers components in oatpp::base::Environment
 *  Order of components initialization is from top to bottom
 */
class AppComponent {
public:

	/**
	 * Create Async Executor
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::async::Executor>, executor)([] {
		return std::make_shared<oatpp::async::Executor>(
			9 /* Data-Processing threads */,
			2 /* I/O threads */,
			1 /* Timer threads */
			);
		}());

	/**
	 *  Create ConnectionProvider component which listens on the port
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::network::ServerConnectionProvider>, serverConnectionProvider)([] {
		/* non_blocking connections should be used with AsyncHttpConnectionHandler for AsyncIO */
		return oatpp::network::tcp::server::ConnectionProvider::createShared({ "0.0.0.0", static_cast<v_uint16>(std::stoi(g_port)), oatpp::network::Address::IP_4 });
		}());

	/**
	 *  Create Router component
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, httpRouter)([] {
		return oatpp::web::server::HttpRouter::createShared();
		}());

	/**
	 *  Create ConnectionHandler component which uses Router component to route requests
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::network::ConnectionHandler>, serverConnectionHandler)([] {
		OATPP_COMPONENT(std::shared_ptr<oatpp::web::server::HttpRouter>, router); // get Router component
		OATPP_COMPONENT(std::shared_ptr<oatpp::async::Executor>, executor); // get Async executor component
		return oatpp::web::server::AsyncHttpConnectionHandler::createShared(router, executor);
		}());

	/**
	 *  Create ObjectMapper component to serialize/deserialize DTOs in Contoller's API
	 */
	OATPP_CREATE_COMPONENT(std::shared_ptr<oatpp::data::mapping::ObjectMapper>, apiObjectMapper)([] {
		auto serializerConfig = oatpp::parser::json::mapping::Serializer::Config::createShared();
		auto deserializerConfig = oatpp::parser::json::mapping::Deserializer::Config::createShared();
		deserializerConfig->allowUnknownFields = false;
		auto objectMapper = oatpp::parser::json::mapping::ObjectMapper::createShared(serializerConfig, deserializerConfig);
		return objectMapper;
		}());

};

#endif //OATPP_SYNC_API

#endif //MONGOOSE

#endif //_HTTPCOMPONENT_H_