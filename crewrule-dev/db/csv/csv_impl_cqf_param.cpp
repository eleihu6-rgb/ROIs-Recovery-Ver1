#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void cqfParamParser::init(vector<string>& headers) {}


string cqfParamParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvRuleParam * ref = (csvRuleParam *)obj;
	//"", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "cqfId") { ss << ref->ruleId << "^"; }
		else if (headers[i] == "phaseId") { ss << ref->phaseId << "^"; }
		else if (headers[i] == "paramNames") { ss << ref->paramNames << "^"; }
		else if (headers[i] == "paramValues") { ss << ref->paramValues << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("cqf_param", headers[i]); }
	}
	return ss.str();
}

void cqfParamParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvRuleParam * ref = (csvRuleParam *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "cqfId") { ref->ruleId = atoll(value); }
	else if (headers[index] == "phaseId") { ref->phaseId = atoi(value); }
	else if (headers[index] == "paramNames") { ref->paramNames = value; }   //20180402 ain, 不再转大写
	else if (headers[index] == "paramValues") { ref->paramValues = value; } //20180402 ain, 不再转大写
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("cqf_param", headers[index]); }
}

void* cqfParamParser::createInstance() {
	return new csvRuleParam();
}

void cqfParamParser::deleteInstance(void* obj) {
	delete (csvRuleParam*)obj;
}

static vector<string> flightCompositionDefaultHeaders = { "id", "cqfId", "phaseId", "paramNames", "paramValues", "lastModified", "modifiedBy" };
vector<string>& cqfParamParser::getDefaultHeaders() {
	return flightCompositionDefaultHeaders;
}