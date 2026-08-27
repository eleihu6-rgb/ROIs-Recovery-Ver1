#include "CalculateDutyAloftInMandayForPRRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/NumberUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

//返回值：计算manday的Duty Aloft(机组在飞机上时间), map<localDay,机组在飞机上时间(Duty Aloft)(分钟数)>
map<time_t, int> CalculateDutyAloftInMandayForPRRule::Calculate(std::vector<const ROSTER*>& rosters) {
	if (_ruleParams.empty() || rosters.empty()) {
		return map<time_t, int>();
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	map<time_t, int> resultMap; //map<localDay, 机组在飞机上时间(Duty Aloft)(分钟数)>

	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		auto& duties = roster->pairing->getDutyVec();
		for (int i = 0; i < duties.size(); i++) {
			auto& duty = duties.at(i);

			map<time_t, int> dutyMap; //按duty存储map<localDay, 机组在飞机上时间(Duty Aloft)(分钟数)>

			for (const auto& ruleParam : _ruleParams) {
				_ruleViolation.ClearParam();
				_ruleViolation.SetRuleParam(ruleParam);

				if (!ruleParam.MatchCrewQualification(roster, crew)) {
					continue;
				}

				if (!ruleParam.MatchParam(duty)) {
					continue;
				}
				int dutyAloftTime = 0;//单位：分钟

				Segment* prevSegment = nullptr;
				for (auto& currSegment : duty->getSegments()) {
					if (ruleParam.MatchParam(currSegment)) {
						int blkMinutes = 0;
						time_t calcStartTimeUtc = currSegment->getStartTimeUtcAct();
						time_t calcEndTimeUtc = 0;

						if (this->IsRosterOptimizerModel() || this->IsPairingOptimizerModel()) {
							blkMinutes = currSegment->getBlkMinutes();
							calcEndTimeUtc = currSegment->getStartTimeUtcAct() + currSegment->getBlkMinutes();
						}
						else {
							blkMinutes = (static_cast<int>(currSegment->getEndTimeUtcAct() - currSegment->getStartTimeUtcAct()) / 60);
							calcEndTimeUtc = currSegment->getEndTimeUtcAct();
						}

						dutyAloftTime += blkMinutes;
						TimeUtils::GetAccumulatedDurationByDay(dutyMap, calcStartTimeUtc, calcEndTimeUtc, offsetTZMinutes);
					}
					if (prevSegment != nullptr) {
						int transit = static_cast<int>(currSegment->getStartTimeUtcAct() - prevSegment->getEndTimeUtcAct()) / 60;
						dutyAloftTime += transit;

						TimeUtils::GetAccumulatedDurationByDay(dutyMap, prevSegment->getEndTimeUtcAct(), currSegment->getStartTimeUtcAct(), offsetTZMinutes);
					}
					prevSegment = currSegment;
				}
				if (!dutyMap.empty()) {
					auto firstDay = dutyMap.begin();//获得第一天（map中key最小值)
					firstDay->second += ruleParam._inFlightWaitTimeMinutes * 60;

					auto lastDay = dutyMap.rbegin();//获得最后一天（map中key最大值)
					lastDay->second += ruleParam._postActivityTimeMinutes * 60;
				}

				dutyAloftTime += (ruleParam._inFlightWaitTimeMinutes + ruleParam._postActivityTimeMinutes);
				duty->setAloftTime(dutyAloftTime);
				const_cast<ROSTER*>(roster)->dutyValues.setAloftTime(i, dutyAloftTime);

				//合并到最终结果中
				for (const auto& pair : dutyMap) {
					resultMap[pair.first] += pair.second;
				}
				break;
			}
		}
	}


	//转换成分钟
	for (auto& pair : resultMap) {
		pair.second = pair.second / 60;
	}
	return resultMap;
}

void CalculateDutyAloftInMandayForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateDutyAloftInMandayForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateDutyAloftInMandayForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}