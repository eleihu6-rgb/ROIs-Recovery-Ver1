#include "BaseUtils.h"

#include <algorithm>

#include "Utility.h"

bool BaseUtils::IsHomeBase(const std::string& station, const vector<BASE>& baseList, const std::string& filiale) {
	bool isHomeBase = false;
	for (auto base : baseList) {
		if (base.airline == filiale && base.base == station) {
			isHomeBase = true;
			break;
		}
	}
	return isHomeBase;
}


bool BaseUtils::IsHomeBaseByBase(const std::string& station, const vector<string>& baseList, const std::string& base) {
	bool isBase = (station == base);

	if (!isBase) {
		//非基地，直接返回fales
		return false;
	}
	//在基地，但baseList为空，这返回在基地。否则判断base是否在baseList列表中
	if (baseList.empty()) {
		return true;
	}
	//判断基地是否在baseList列表中
	auto iter = std::find(baseList.cbegin(), baseList.cend(), base);
	return iter != baseList.cend();
}

std::string BaseUtils::GetCrewPrimaryBase(const CREW& crew, const time_t& startUtc) {
	//time_t tempStart = rosters[0]->actEndUtc;

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(const_cast<vector<SharedPtr<CREW_BASE>>&>(crew.baseList), startUtc);
	return base;
}