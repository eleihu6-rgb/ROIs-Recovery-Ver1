#include <stdio.h>
#include <string>
#include <sstream>
#include <vector>
#include <unordered_map>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"

using namespace std;

std::string makeLeadinInfo(long long pair_id, long long comp_id, long long flt_id, unordered_map<long long, composition_rank>& rankCompositionMap) {
	int i = 0;
	stringstream iss;
	composition_rank comp = rankCompositionMap[comp_id];
	iss << "pair_id," << pair_id << ",comp_id," << comp_id << ",flt_id," << flt_id << ",comp_rank,";
	for (i = 0; i < comp.rankCount; i++) {
		iss << comp.rankValue[i].rank << ":" << comp.rankValue[i].plan_value;
	}
	return iss.str();
}