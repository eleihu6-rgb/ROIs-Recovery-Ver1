#include <sstream>
#include <string.h>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void liveConfigParser::init(vector<string>& headers) {}

string liveConfigParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	LiveConfig * ref = (LiveConfig *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "filiale") { ss << ref->filiale << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "rulesetId") { ss << ref->ruleSetId << "^"; }
		else if (headers[i] == "ruleSetName") { ss << "^"; }
		else if (headers[i] == "defaultRulesetFlag") { ss << (ref->defaultRuleSetFlag ? "Y" : "N") << "^"; }
		else if (headers[i] == "module") { ss << ref->module << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("liveConfig", headers[i]); }
	}
	return ss.str();
}

void liveConfigParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	LiveConfig * ref = (LiveConfig *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "filiale") { ref->filiale = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "rulesetId") { ref->ruleSetId = atoll(value); }
	else if (headers[index] == "ruleSetName") { }
	else if (headers[index] == "defaultRulesetFlag") { ref->defaultRuleSetFlag = (isValueYesTrueOne(value) ? true : false);	}
	else if (headers[index] == "module") { ref->module = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("liveConfig", headers[index]); }
}

void* liveConfigParser::createInstance() {
	return new LiveConfig();
}

void liveConfigParser::deleteInstance(void* obj) {
	delete (LiveConfig*)obj;
}

static vector<string> liveConfigDefaultHeaders = { "id", "filiale", "division", "rulesetId","ruleSetName", "defaultRulesetFlag", "module", "lastModified", "modifiedBy"};
vector<string>& liveConfigParser::getDefaultHeaders() {
	return liveConfigDefaultHeaders;
}