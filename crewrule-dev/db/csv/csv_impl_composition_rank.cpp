#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void compositionRankParser::init(vector<string>& headers) {}


string compositionRankParser::toCsv(vector<string>& headers, void* obj) {
	//,,,
	stringstream ss;
	csvCompositionRank * ref = (csvCompositionRank *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "compId") { ss << ref->compId << "^"; }
		else if (headers[i] == "rankId") { ss << ref->rankId << "^"; }
		else if (headers[i] == "planValue") { ss << ref->planValue << "^"; }
		else if (headers[i] == "planValueExtra") { ss << ref->planValueExtra << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("composition_rank", headers[i]); }
	}
	return ss.str();
}

void compositionRankParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvCompositionRank * ref = (csvCompositionRank *)obj;
	if (headers[index] == "id") { ref->id = atoll(value) ; }
	else if (headers[index] == "compId") { ref->compId = atoll(value); }
	else if (headers[index] == "rankId") { ref->rankId = atoll(value); }
	else if (headers[index] == "rank") { }
	else if (headers[index] == "planValue") { ref->planValue = atoi(value); }
	else if (headers[index] == "planValueExtra") { ref->planValueExtra = atoi(value); }
	else if (headers[index] == "options") { ref->option = atoi(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("composition_rank", headers[index]); }
}

void* compositionRankParser::createInstance() {
	return new csvCompositionRank();
}

void compositionRankParser::deleteInstance(void* obj) {
	delete (csvCompositionRank*)obj;
}

static vector<string> compositionDefaultHeaders = { "id", "compId", "rankId", "planValue", "planValueExtra", "lastModified", "modifiedBy" };
vector<string>& compositionRankParser::getDefaultHeaders() {
	return compositionDefaultHeaders;
}