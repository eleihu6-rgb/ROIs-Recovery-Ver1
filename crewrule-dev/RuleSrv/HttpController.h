#ifndef _HTTPCONTROLLER_H_
#define _HTTPCONTROLLER_H_

#ifndef MONGOOSE
#include <memory>

#include "oatpp/web/server/api/ApiController.hpp"
#include "oatpp/core/macro/codegen.hpp"
#include "oatpp/core/macro/component.hpp"

#include "WebSrv.h"
#include "ErrorContext.h"
#include "Log/Logger.h"

class HttpController : public oatpp::web::server::api::ApiController {
public:
	typedef HttpController __ControllerType;//define the data type of controller

protected:
	HttpController(const std::shared_ptr<ObjectMapper>& objectMapper)
		: oatpp::web::server::api::ApiController(objectMapper)
	{}

private:
	oatpp::String getHttpParameter(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, const oatpp::data::share::StringKeyLabel& name) const;

	std::shared_ptr<OutgoingResponse> handle_load_scenario(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_session_destroy(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_check_pairing(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_check_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_update_flight(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_try_pairing_on_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_update_list(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_get_rosters(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_query_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_update_crew(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_route_actual_rest(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_crew_preference(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_crew_entitlement(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_crew_manday(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_update_basedata(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_check_duty_code(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_get_duty_code(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_get_worry_data(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_update_scenario(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> handle_test(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, bool alwaysReloadData = true);

	std::shared_ptr<OutgoingResponse> handle_test_scenario(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request);

	std::shared_ptr<OutgoingResponse> HANDLE_RESULT(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, ErrorContext * errCtx);

	std::shared_ptr<OutgoingResponse> HANDLE_RESULT(const QueryParams& queryParams, const std::shared_ptr<IncomingRequest>& request, ErrorContext * errCtx, stringstream& responseData);
public:

	/**
	 *  Inject @objectMapper component here as default parameter
	 *  Do not return bare Controllable* object! use shared_ptr!
	 */
	static std::shared_ptr<HttpController> createShared(OATPP_COMPONENT(std::shared_ptr<ObjectMapper>,
		objectMapper)) {
		return std::shared_ptr<HttpController>(new HttpController(objectMapper));
	}


	#include OATPP_CODEGEN_BEGIN(ApiController) //<-- Begin codegen

	#ifdef OATPP_SYNC_API

	ENDPOINT("GET", CMD_LOAD_SCENARIO, LoadScenario,
			QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_load_scenario request url:{}", path.toString().getValue(""));
		return handle_load_scenario(queryParams, request);
	}

	ENDPOINT("GET", CMD_DESTROY_SESSION, DestroySession,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_session_destroy request url:{}", path.toString().getValue(""));
		return handle_session_destroy(queryParams, request);
	}

	ENDPOINT("GET", CMD_CHECK_RULE, CheckRule,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_check_pairing request url:{}", path.toString().getValue(""));
		return handle_check_pairing(queryParams, request);
	};

	ENDPOINT("GET", CMD_CHECK_CREW, CheckCrew,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_check_crew request url:{}", path.toString().getValue(""));
		return handle_check_crew(queryParams, request);
	};

	ENDPOINT("GET", CMD_UPDATE_FLIGHT, UpdateFlight,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_update_flight request url:{}", path.toString().getValue(""));
		return handle_update_flight(queryParams, request);
	};

	ENDPOINT("GET", CMD_TRY_PAIRING, TryPairing,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_try_pairing_on_crew request url:{}", path.toString().getValue(""));
		return handle_try_pairing_on_crew(queryParams, request);
	};

	ENDPOINT("GET", CMD_UPDATE_LIST, UpdateList,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_update_list request url:{}", path.toString().getValue(""));
		return handle_update_list(queryParams, request);
	};

	ENDPOINT("GET", CMD_GET_ROSTERS, GetRosters,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_get_rosters request url:{}", path.toString().getValue(""));
		return handle_get_rosters(queryParams, request);
	};

	ENDPOINT("GET", CMD_MGR_QUERY_CREW, QueryCrew,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_query_crew request url:{}", path.toString().getValue(""));
		return handle_query_crew(queryParams, request);
	};

	ENDPOINT("GET", CMD_UPDATE_CREW, UpdateCrew,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_update_crew request url:{}", path.toString().getValue(""));
		return handle_update_crew(queryParams, request);
	};

	ENDPOINT("GET", CMD_ROUTE_ACT_REST, RouteActRest,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_route_actual_rest request url:{}", path.toString().getValue(""));
		return handle_route_actual_rest(queryParams, request);
	};

	ENDPOINT("GET", CMD_CREW_PREFERENCE, CrewPreference,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_crew_preference request url:{}", path.toString().getValue(""));
		return handle_crew_preference(queryParams, request);
	};

	ENDPOINT("GET", CMD_CREW_ENTITLEMENT, CrewEntitlement,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_crew_entitlement request url:{}", path.toString().getValue(""));
		return handle_crew_entitlement(queryParams, request);
	};

	ENDPOINT("GET", CMD_CREW_MANDAY, CrewManday,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_crew_manday request url:{}", path.toString().getValue(""));
		return handle_crew_manday(queryParams, request);
	};

	ENDPOINT("GET", CMD_UPDATE_BASEDATA, UpdateBaseData,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_update_basedata request url:{}", path.toString().getValue(""));
		return handle_update_basedata(queryParams, request);
	};

	ENDPOINT("GET", CMD_UPDATE_SCENARIO, UpdateScenario,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_update_scenario request url:{}", path.toString().getValue(""));
		return handle_update_scenario(queryParams, request);
	};

	ENDPOINT("GET", CMD_TEST, Test,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_test request url:{}", path.toString().getValue(""));
		return handle_test(queryParams, request);
	};

	ENDPOINT("GET", CMD_TEST_SCENARIO, TestScenario,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_test_scenario request url:{}", path.toString().getValue(""));
		return handle_test_scenario(queryParams, request);
	};
	
	ENDPOINT("GET", CMD_CHECK_DUTY_CODE, CheckDutyCode,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_check_duty_code request url:{}", path.toString().getValue(""));
		return handle_check_duty_code(queryParams, request);
	};

	ENDPOINT("GET", CMD_GET_DUTY_CODE, GetDutyCode,
		QUERIES(QueryParams, queryParams), REQUEST(std::shared_ptr<IncomingRequest>, request)) {
		auto& path = request->getStartingLine().path;
		Logger::getRuleLogger()->debug("handle_get_duty_code request url:{}", path.toString().getValue(""));
		return handle_get_duty_code(queryParams, request);
	};

	#else
	
	ENDPOINT_ASYNC("GET", CMD_LOAD_SCENARIO, LoadScenario) {

		ENDPOINT_ASYNC_INIT(LoadScenario)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_load_scenario(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_DESTROY_SESSION, DestroySession) {

		ENDPOINT_ASYNC_INIT(DestroySession)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_session_destroy(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_CHECK_RULE, CheckRule) {

		ENDPOINT_ASYNC_INIT(CheckRule)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_check_pairing(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_CHECK_CREW, CheckCrew) {

		ENDPOINT_ASYNC_INIT(CheckCrew)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_check_crew(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_UPDATE_FLIGHT, UpdateFlight) {

		ENDPOINT_ASYNC_INIT(UpdateFlight)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_update_flight(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_TRY_PAIRING, TryPairing) {

		ENDPOINT_ASYNC_INIT(TryPairing)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_try_pairing_on_crew(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_UPDATE_LIST, UpdateList) {

		ENDPOINT_ASYNC_INIT(UpdateList)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_update_list(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_GET_ROSTERS, GetRosters) {

		ENDPOINT_ASYNC_INIT(GetRosters)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_get_rosters(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_MGR_QUERY_CREW, QueryCrew) {

		ENDPOINT_ASYNC_INIT(QueryCrew)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_query_crew(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_UPDATE_CREW, UpdateCrew) {

		ENDPOINT_ASYNC_INIT(UpdateCrew)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_update_crew(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_ROUTE_ACT_REST, RouteActRest) {

		ENDPOINT_ASYNC_INIT(RouteActRest)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_route_actual_rest(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_CREW_PREFERENCE, CrewPreference) {

		ENDPOINT_ASYNC_INIT(CrewPreference)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_crew_preference(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_CREW_ENTITLEMENT, CrewEntitlement) {

		ENDPOINT_ASYNC_INIT(CrewEntitlement)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_crew_entitlement(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_CREW_MANDAY, CrewManday) {

		ENDPOINT_ASYNC_INIT(CrewManday)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_crew_manday(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_UPDATE_BASEDATA, UpdateBaseData) {

		ENDPOINT_ASYNC_INIT(UpdateBaseData)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_update_basedata(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_UPDATE_SCENARIO, UpdateScenario) {

		ENDPOINT_ASYNC_INIT(UpdateScenario)

			/**
			*  Coroutine entrypoint act()
			*  returns Action (what to do next)
			*/
			Action act() override {
			return _return(controller->handle_update_scenario(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_CHECK_DUTY_CODE, CheckDutyCode) {

		ENDPOINT_ASYNC_INIT(CheckDutyCode)

			/**
			*  Coroutine entrypoint act()
			*  returns Action (what to do next)
			*/
			Action act() override {
			return _return(controller->handle_check_duty_code(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_GET_DUTY_CODE, GetDutyCode) {

		ENDPOINT_ASYNC_INIT(GetDutyCode)

			/**
			*  Coroutine entrypoint act()
			*  returns Action (what to do next)
			*/
			Action act() override {
			return _return(controller->handle_get_duty_code(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_TEST, Test) {

		ENDPOINT_ASYNC_INIT(Test)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_test(request->getQueryParameters(), request));
		}
	};

	ENDPOINT_ASYNC("GET", CMD_TEST_SCENARIO, TestScenario) {

		ENDPOINT_ASYNC_INIT(TestScenario)

		/**
		*  Coroutine entrypoint act()
		*  returns Action (what to do next)
		*/
		Action act() override {
			return _return(controller->handle_test_scenario(request->getQueryParameters(), request));
		}
	};
	
	#endif //OATPP_SYNC_API
	
	#include OATPP_CODEGEN_BEGIN(ApiController) //<-- End codegen
};



#endif //MONGOOSE

#endif //_HTTPCONTROLLER_H_