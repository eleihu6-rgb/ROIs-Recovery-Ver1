#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rankActingParser::init(vector<string>& headers) {}


static vector<string> csvRankActingDefaultHeaders = { "id", "airline", "activeRank", "actingRank", "qual", "lastModified", "modifiedBy", "filiale" };
vector<string>& rankActingParser::getDefaultHeaders() {
	return csvRankActingDefaultHeaders;
}

void* rankActingParser::createInstance() {
	return new csvRankActing();
}

void rankActingParser::deleteInstance(void* obj) {
	delete (csvRankActing*)obj;
}

string rankActingParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvRankActing * ref = (csvRankActing *)obj;
	//"", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id" || headers[i] == "rankId") { ss << ref->id << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "activeRank") { ss << ref->activeRank << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "qual") { ss << ref->qual << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else { logUnkonwnField("rank_acting", headers[i]); }
	}
	return ss.str();
}

void rankActingParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvRankActing * ref = (csvRankActing *)obj;
	if (headers[index] == "id" || headers[index] == "rankId") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "activeRank") { ref->activeRank = value; }
	else if (headers[index] == "actingRank") { ref->actingRank = value; }
	else if (headers[index] == "qual") { ref->qual = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") {}
	else { logUnkonwnField("rank_acting", headers[index]); }
}

