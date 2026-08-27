#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rulePhaseConfigParser::init(vector<string>& headers) {}


static vector<string> rulePhaseConfigDefaultHeaders = { "id","phaseName","strDtType","strDtRange","strDtRangeDays","strDtRangeUnit","strDtRangeType","endDtType","endDtRange","endDtRangeDays","endDtRangeUnit","endDtRangeType", "showIndex", "modifiedBy", "lastModified"};
vector<string>& rulePhaseConfigParser::getDefaultHeaders() {
	return rulePhaseConfigDefaultHeaders;
}

void* rulePhaseConfigParser::createInstance() {
	return new RulePhaseConfig();
}

void rulePhaseConfigParser::deleteInstance(void* obj) {
	delete (RulePhaseConfig*)obj;
}

string rulePhaseConfigParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RulePhaseConfig * ref = (RulePhaseConfig *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "phaseName") { ss << ref->phaseName << "^"; }
		else if (headers[i] == "strDtType") { ss << ref->strDtType << "^"; }
		else if (headers[i] == "strDtRange") { ss << ref->strDtRange << "^"; }
		else if (headers[i] == "strDtRangeDays") { ss << ref->strDtRangeDays << "^"; }
		else if (headers[i] == "strDtRangeUnit") { ss << ref->strDtRangeUnit << "^"; }
		else if (headers[i] == "strDtRangeType") { ss << ref->strDtRangeType << "^"; }
		else if (headers[i] == "endDtType") { ss << ref->endDtType << "^"; }
		else if (headers[i] == "endDtRange") { ss << ref->endDtRange << "^"; }
		else if (headers[i] == "endDtRangeDays") { ss << ref->endDtRangeDays << "^"; }
		else if (headers[i] == "endDtRangeUnit") { ss << ref->endDtRangeUnit << "^"; }
		else if (headers[i] == "endDtRangeType") { ss << ref->endDtRangeType << "^"; }
		else if (headers[i] == "showIndex") { ss << ref->showIndex << "^"; }
		else if (headers[i] == "modifiedBy") { }
		else if (headers[i] == "lastModified") { }
		else { logUnkonwnField("rulePhaseConfig", headers[i]); }
	}
	return ss.str();
}

void rulePhaseConfigParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RulePhaseConfig * ref = (RulePhaseConfig *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "phaseName") { ref->phaseName = value; }
	else if (headers[index] == "strDtType") { ref->strDtType = value; }
	else if (headers[index] == "strDtRange") { ref->strDtRange = value; }
	else if (headers[index] == "strDtRangeDays") { ref->strDtRangeDays = atoi(value); }
	else if (headers[index] == "strDtRangeUnit") { ref->strDtRangeUnit = value; }
	else if (headers[index] == "strDtRangeType") { ref->strDtRangeType = value; }
	else if (headers[index] == "endDtType") { ref->endDtType = value; }
	else if (headers[index] == "endDtRange") { ref->endDtRange = value; }
	else if (headers[index] == "endDtRangeDays") { ref->endDtRangeDays = atoi(value); }
	else if (headers[index] == "endDtRangeUnit") { ref->endDtRangeUnit = value; }
	else if (headers[index] == "endDtRangeType") { ref->endDtRangeType = value; }
	else if (headers[index] == "showIndex") { ref->showIndex = atoi(value); }
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("rulePhaseConfig", headers[index]); }
}

