#include <sstream>
#include "Segment.h"
#include "UtilFunc.h"
#include "CrewDB.h"
#include "csv_impl.h"
#include "JsonLive.h"
//#include "rapidjson\document.h"		// rapidjson's DOM-style API

using namespace rapidjson;

static vector<string> ScenarioKpiDefaultHeaders = { "id", "scenarioId", "kpiNames", "kpiValues", "description", "idx", "lastModified", "modifiedBy"};
vector<string>& scenarioKpiParser::getDefaultHeaders() {
	return ScenarioKpiDefaultHeaders;
}

void scenarioKpiParser::init(vector<string>& headers) {}

void* scenarioKpiParser::createInstance() {
	return new ScenarioKpi();
}

void scenarioKpiParser::deleteInstance(void* obj) {
	delete (ScenarioKpi*)obj;
}

string scenarioKpiParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	ScenarioKpi * ref = (ScenarioKpi *)obj;
	//"", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "scenarioId") { ss << ref->scenarioId << "^"; }
		else if (headers[i] == "kpiNames") { ss << ref->kpiNames << "^"; }
		else if (headers[i] == "kpiValues") { ss << ref->kpiValues << "^"; }
		else if (headers[i] == "description") { ss << ref->description << "^"; }
		else if (headers[i] == "idx") { ss << ref->idx << "^"; }
		else if (headers[i] == "lastModified"){ ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
	

		else { logUnkonwnField("scenario_kpi", headers[i]); }
	}
	return ss.str();
}

void scenarioKpiParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	ScenarioKpi * ref = (ScenarioKpi *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "scenarioId") { ref->scenarioId = atoll(value); }
	else if (headers[index] == "kpiNames") { ref->kpiNames = value; }
	else if (headers[index] == "kpiValues") { ref->kpiValues = value; }
	else if (headers[index] == "description") { ref->description = value;  }
	else if (headers[index] == "idx") { ref->idx = atoi(value); }
	else if (headers[index] == "type") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}

	else { logUnkonwnField("scenario_kpi", headers[index]); }
}

