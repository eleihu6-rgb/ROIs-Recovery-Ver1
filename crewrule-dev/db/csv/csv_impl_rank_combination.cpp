#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rankCombinationParser::init(vector<string>& headers) {}


static vector<string> rankCombinationDefaultHeaders = { "id", "rankCombCriteriaId", "options", "seqOrder", "rank", "positions", "options" };
vector<string>& rankCombinationParser::getDefaultHeaders() {
	return rankCombinationDefaultHeaders;
}

void* rankCombinationParser::createInstance() {
	return new RankCombination();
}

void rankCombinationParser::deleteInstance(void* obj) {
	delete (RankCombination*)obj;
}

string rankCombinationParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RankCombination * ref = (RankCombination *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "rankCombCriteriaId") { ss << ref->rankCombCriteriaId << "^"; }
		else if (headers[i] == "options") { ss << ref->options << "^"; }
		else if (headers[i] == "seqOrder") { ss << ref->seqOrder << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "positions") { ss << ref->positions << "^"; }
		else if (headers[i] == "options") { ss << "^"; }
		else { logUnkonwnField("rank_combination", headers[i]); }
	}
	return ss.str();
}

void rankCombinationParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RankCombination * ref = (RankCombination *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "rankCombCriteriaId") { ref->rankCombCriteriaId = atoll(value); }
	else if (headers[index] == "options") { ref->options = atoi(value); }
	else if (headers[index] == "seqOrder") { ref->seqOrder = atoi(value); }
	else if (headers[index] == "rank") { ref->rank = value; }
	else if (headers[index] == "positions") { ref->positions = value; }
	else if (headers[index] == "options") { }
	else { logUnkonwnField("rank_combination", headers[index]); }
}

