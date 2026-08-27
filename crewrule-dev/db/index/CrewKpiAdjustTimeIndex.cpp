#include <stdio.h>
#include <vector>
#include <algorithm>

#include <limits.h>

#include <iostream>
#include <time.h>
#include "UtilFunc.h"
#include "CrewDB.h"
#include "Log/Logger.h"

//根据CrewKpiAdjust计算 map<time_t, sum>
CrewKpiAdjustTimeIndex::CrewKpiAdjustTimeIndex(const std::vector<std::shared_ptr<CrewKpiAdjust>>& crewKpiAdjustList) {
	makeIndex(crewKpiAdjustList);
}

const map<time_t, int>& CrewKpiAdjustTimeIndex::getPerdiemIndex() {
	return _perdiemAdjustIndex;
}

const map<time_t, int>& CrewKpiAdjustTimeIndex::getCreditIndex() {
	return _creditAdjustIndex;
}

void CrewKpiAdjustTimeIndex::makeIndex(const std::vector<std::shared_ptr<CrewKpiAdjust>>& crewKpiAdjustList) {
	_perdiemAdjustIndex.clear();
	_creditAdjustIndex.clear();
	for (auto& crewKpiAdjust : crewKpiAdjustList) {
		if (crewKpiAdjust->type == 0) {
			//调整的是 credit hours(计薪时长)
			auto iter = _creditAdjustIndex.find(crewKpiAdjust->adjustDate);
			if (iter == _creditAdjustIndex.end()) {
				_creditAdjustIndex.insert(std::make_pair(crewKpiAdjust->adjustDate, crewKpiAdjust->adjustment));
			}
			else {
				iter->second += crewKpiAdjust->adjustment;
			}
			
		}
		else if (crewKpiAdjust->type == 1) {
			//调整的是 perdiem hours(津贴时长)
			auto iter = _perdiemAdjustIndex.find(crewKpiAdjust->adjustDate);
			if (iter == _perdiemAdjustIndex.end()) {
				_perdiemAdjustIndex.insert(std::make_pair(crewKpiAdjust->adjustDate, crewKpiAdjust->adjustment));
			}
			else {
				iter->second += crewKpiAdjust->adjustment;
			}
		}
	}
}