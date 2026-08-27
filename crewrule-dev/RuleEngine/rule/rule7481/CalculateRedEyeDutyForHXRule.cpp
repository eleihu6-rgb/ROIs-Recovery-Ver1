/**
 * @file CalculateRedEyeDutyForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14
**/

#include "CalculateRedEyeDutyForHXRule.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../period/BaseActivityPeriod.h"


void CalculateRedEyeDutyForHXRule::CalculateDuty(Pairing *pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}
	auto& duties = pairing->getDutyVec();
	std::string base = pairing->getBase();
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}
    int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(pairing->getStartTimeUtcAct(), base, this->_dbData);

    auto activityPeriods = BaseActivityPeriod::GetActivityPeriodsOfDuty(pairing);
    CalculateRedEyeDuty(activityPeriods, base, offsetTZMinutes);
}

void CalculateRedEyeDutyForHXRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}
    std::string base = duty->getDepStationRead();
    int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(duty->getStartTimeUtcAct(), base, this->_dbData);

    vector<shared_ptr<BaseActivityPeriod>> activityPeriods;
    activityPeriods.emplace_back(BaseActivityPeriod::GetActivityPeriodOfDuty(duty));

    CalculateRedEyeDuty(activityPeriods, base, offsetTZMinutes);
}

void CalculateRedEyeDutyForHXRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
    int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeUtcAct(), crewBase, this->GetDataContext());

    auto activityPeriods = BaseActivityPeriod::GetActivityPeriodsOfDuty(rosters);
    CalculateRedEyeDuty(activityPeriods, crewBase, offsetTZMinutes);
}

void CalculateRedEyeDutyForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	vector<DBRule> table2DbRules;
	for (const auto& dbRule : input.dbRules) {
		if (dbRule.tableNum == 1) {
			_ruleParams.emplace_back(RedEyeDutyForHXRuleParam(this));
			auto& newParam = _ruleParams.back();
			newParam.ParseParam(dbRule);
		}
		else {
			table2DbRules.emplace_back(dbRule);
		}
	}
	if (!_ruleParams.empty()) {
		auto& ruleParam = _ruleParams[0];
		for (const auto& dbRule : table2DbRules) {
			ruleParam.ParseParam(dbRule);
		}
		for (std::size_t i = 1; i < _ruleParams.size(); i++) {
			_ruleParams[i].SetRedEyeDefinitionInDutyCycleForHXParams(ruleParam.GetRedEyeDefinitionInDutyCycleForHXParams());
		}
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RedEyeDutyForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

const bool CalculateRedEyeDutyForHXRule::isRedEyeDuty(RedEyeDefinitionForHXParam*& matchedRuleParam, const Duty* duty, const string& base, const int offsetTZMinutes) const {
    for (auto& ruleParam : _ruleParams) {
        auto& redEyeDefParam = ruleParam.GetRedEyeDefinitionParam();
        
        bool isBase = duty->getDepStationRead() == base;
        if (redEyeDefParam._isBase != isBase) {
            continue;
        }

        //auto firstPickup = currDuty->getFirstPickup();
        //if (firstPickup == nullptr) {
        //    continue;
        //}
        //int pickupMinutes = (firstPickup->getEndUtc() - firstPickup->getStartUtc()) / 60;
        int pickupMinutes = duty->getMinPickup();
        if (pickupMinutes < redEyeDefParam._pickupLowerMinutes || pickupMinutes > redEyeDefParam._pickupUpperMinutes) {
            continue;
        }

        ////红眼任务FDP时间段通过计划时间来判断(目前确定实际时间来计算)
        //time_t schCheckinTimeLoc = SchDutyUtils::GetDutySchStartTimeUtc(duty) + (time_t)offsetTZMinutes * 60;
        //time_t schCheckoutTimeLoc = SchDutyUtils::GetDutySchEndTimeUtc(duty) + (time_t)offsetTZMinutes * 60;
        time_t checkinTimeLoc = duty->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
        time_t checkoutTimeLoc = duty->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
        if (TimeUtils::IsTimesCovered(checkinTimeLoc, checkoutTimeLoc, redEyeDefParam._woclStartMinutes, redEyeDefParam._woclEndMinutes)) {
            matchedRuleParam = &redEyeDefParam;
            return true;
        }

   }
    return false;
}

const bool CalculateRedEyeDutyForHXRule::isRedEyeRoster(RedEyeDefinitionForHXParam*& matchedRuleParam, const ROSTER* roster, const string& base, const int offsetTZMinutes) const {
    for (auto& ruleParam : _ruleParams) {
        auto& redEyeDefParam = ruleParam.GetRedEyeDefinitionParam();

        bool isBase = roster->location == base;
        if (redEyeDefParam._isBase != isBase) {
            continue;
        }

        time_t checkinTimeLoc = roster->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
        time_t checkoutTimeLoc = roster->getRestStartUtcAct() + (time_t)offsetTZMinutes * 60;
        if (TimeUtils::IsTimesCovered(checkinTimeLoc, checkoutTimeLoc, redEyeDefParam._woclStartMinutes, redEyeDefParam._woclEndMinutes)) {
            matchedRuleParam = &redEyeDefParam;
            return true;
        }
    }
    return false;
}

const bool CalculateRedEyeDutyForHXRule::isRedEyeFlyDuty(RedEyeDefinitionForHXParam*& matchedRuleParam, const Duty* duty, const string& base, const int offsetTZMinutes) const {
    if (duty->getFDPInSecs() <= 0) {
        return false;
    }
    return isRedEyeDuty(matchedRuleParam, duty, base, offsetTZMinutes);
}


void CalculateRedEyeDutyForHXRule::CalculateRedEyeDuty(vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const string& defaultBase, const int offsetTZMinutes) {
    if (_ruleParams.empty()) {
        return;
    }

    //清空红眼任务标志
    for (size_t i = 0; i < activityPeriods.size(); i++) {
        auto& activityPeriod = activityPeriods[i];
        auto activity = activityPeriod->GetActivity();
        activity->setIsRedEye(false);//红眼标记仅设置Duty或地面任务Roster
        activity->setRedEyeStartMinutes(-1);
        activity->setRedEyeEndMinutes(-1);
    }

    //计算红眼任务
    for (size_t i = 0; i < activityPeriods.size(); i++) {
        auto& activityPeriod = activityPeriods[i];
        auto roster = activityPeriod->GetRoster();
        if (roster !=nullptr && roster->pairing == nullptr) {
            continue;
        }

        //兼容PO，仅有Duty或Pairing没有Roster
        string base = defaultBase;
        if (roster != nullptr) {
            base = roster->pairing == nullptr ? roster->location : roster->pairing->getBase();
        }

        Duty* duty = (Duty*)activityPeriod->GetActivity();
        RedEyeDefinitionForHXParam* matchedRuleParam = nullptr;
        if (isRedEyeFlyDuty(matchedRuleParam, duty, base, offsetTZMinutes)) {
            duty->setIsRedEye(true);
            duty->setRedEyeStartMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclStartMinutes);
            duty->setRedEyeEndMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclEndMinutes);
            //基于当前FlyDuty的红眼任务，向前和先后检查地面任务是否满足红眼任务条件
            calcRedEyeBefore(duty, i, activityPeriods, defaultBase, offsetTZMinutes);
            calcRedEyeAfter(duty, i, activityPeriods, defaultBase, offsetTZMinutes);
        }
    }
}

//基于当前红眼任务，向前检查地面任务Duty是否可以为红眼任务
void CalculateRedEyeDutyForHXRule::calcRedEyeBefore(const Duty* redEyeDuty, const size_t currIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const string& defaultBase, const int offsetTZMinutes) {
    Activity* recencyRedEyeActivity = const_cast<Duty*>(redEyeDuty);
    for (int i = (int)currIndex - 1; i >= 0; i--) {
        auto& activityPeriod = activityPeriods[i];
        auto prevRoster = activityPeriod->GetRoster();

        //兼容PO，仅有Duty或Pairing没有Roster
        string base = defaultBase;
        if (prevRoster != nullptr) {
            base = prevRoster->pairing == nullptr ? prevRoster->location : prevRoster->pairing->getBase();
        }

        if (prevRoster != nullptr && prevRoster->pairing == nullptr) {
            time_t gapStartLoc = prevRoster->getRestStartUtcAct() + (time_t)offsetTZMinutes * 60;
            time_t gapEndLoc = recencyRedEyeActivity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
            int gapDays = TimeUtils::DiffDay(gapStartLoc, gapEndLoc);
            if (gapDays > 1) {
                //二个Duty间隔超过1天，时间不满足红眼任务条件
                return;
            }

            if (prevRoster->dpMinutes <= 0) {
                //不是地面任务Duty 或者 Duty无DP 则不需要重新计算是否是红眼任务
                continue;
            }

            RedEyeDefinitionForHXParam* matchedRuleParam = nullptr;
            if (!isRedEyeRoster(matchedRuleParam, prevRoster, prevRoster->location, offsetTZMinutes)) {
                //不在红眼时段，则继续
                continue;
            }

            bool ignoreRedEye = false;
            bool beforeMatched = false;//向前匹配
            auto& redEyeDefInDutyCycleParams = _ruleParams[0].GetRedEyeDefinitionInDutyCycleForHXParams();
            for (auto& redEyeDefInDutyCycleParam : redEyeDefInDutyCycleParams) {
                if (!redEyeDefInDutyCycleParam._isBeforeFDP) {
                    continue;
                }
                beforeMatched = true;
                if (find(redEyeDefInDutyCycleParam._excludeAssignments.begin(), redEyeDefInDutyCycleParam._excludeAssignments.end(), prevRoster->qualifier) != redEyeDefInDutyCycleParam._excludeAssignments.end()) {
                    //在排除的任务中
                    ignoreRedEye = true;
                    break;
                }
            }
            if (beforeMatched && !ignoreRedEye) {
                prevRoster->setIsRedEye(true);
                prevRoster->setRedEyeStartMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclStartMinutes);
                prevRoster->setRedEyeEndMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclEndMinutes);
                recencyRedEyeActivity = prevRoster;
            }
        }
        else {
            Duty* prevDuty = (Duty*)activityPeriod->GetActivity();

            time_t gapStartLoc = prevDuty->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
            time_t gapEndLoc = recencyRedEyeActivity->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
            int gapDays = TimeUtils::DiffDay(gapStartLoc, gapEndLoc);
            if (gapDays > 1) {
                //二个Duty间隔超过1天，时间不满足红眼任务条件
                return;
            }

            if (prevDuty->getFDPInSecs() > 0 || prevDuty->getDPInSecs() <= 0) {
                //不是地面任务Duty 或者 Duty无DP 则不需要重新计算是否是红眼任务
                continue;
            }

            RedEyeDefinitionForHXParam* matchedRuleParam = nullptr;
            if (!isRedEyeDuty(matchedRuleParam, prevDuty, base, offsetTZMinutes)) {
                //不在红眼时段，则继续
                continue;
            }

            bool ignoreRedEye = false;
            bool beforeMatched = false;//向前匹配
            auto& redEyeDefInDutyCycleParams = _ruleParams[0].GetRedEyeDefinitionInDutyCycleForHXParams();
            for (auto& redEyeDefInDutyCycleParam : redEyeDefInDutyCycleParams) {
                if (!redEyeDefInDutyCycleParam._isBeforeFDP) {
                    continue;
                }
                beforeMatched = true;
                if (find(redEyeDefInDutyCycleParam._excludeAssignments.begin(), redEyeDefInDutyCycleParam._excludeAssignments.end(), prevDuty->getAssignment()) != redEyeDefInDutyCycleParam._excludeAssignments.end()) {
                    //在排除的任务中
                    ignoreRedEye = true;
                    break;
                }
            }
            if (beforeMatched && !ignoreRedEye) {
                prevDuty->setIsRedEye(true);
                prevDuty->setRedEyeStartMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclStartMinutes);
                prevDuty->setRedEyeEndMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclEndMinutes);
                recencyRedEyeActivity = prevDuty;
            }
        }
    }
}

//基于当前红眼任务，向后检查地面任务Duty是否可以为红眼任务
void CalculateRedEyeDutyForHXRule::calcRedEyeAfter(const Duty* redEyeDuty, const size_t currIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const string& defaultBase, const int offsetTZMinutes) {
    Activity* recencyRedEyeActivity = const_cast<Duty*>(redEyeDuty);
    for (int i = (int)currIndex + 1; i < activityPeriods.size(); i++) {
        auto& activityPeriod = activityPeriods[i];
        auto nextRoster = activityPeriod->GetRoster();

        //兼容PO，仅有Duty或Pairing没有Roster
        string base = defaultBase;
        if (nextRoster != nullptr) {
            base = nextRoster->pairing == nullptr ? nextRoster->location : nextRoster->pairing->getBase();
        }
        
        if (nextRoster != nullptr && nextRoster->pairing == nullptr) {
            time_t gapStartLoc = recencyRedEyeActivity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
            if (typeid(*recencyRedEyeActivity) == typeid(ROSTER)) {
                gapStartLoc = ((ROSTER*)recencyRedEyeActivity)->getRestStartUtcAct() + (time_t)offsetTZMinutes * 60;
            }
            time_t gapEndLoc = nextRoster->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
            int gapDays = TimeUtils::DiffDay(gapStartLoc, gapEndLoc);
            if (gapDays > 1) {
                //二个Duty间隔超过1天，时间不满足红眼任务条件
                return;
            }

            if (nextRoster->dpMinutes <= 0) {
                //不是地面任务Duty 或者 Duty无DP 则不需要重新计算是否是红眼任务
                continue;
            }

            RedEyeDefinitionForHXParam* matchedRuleParam = nullptr;
            if (!isRedEyeRoster(matchedRuleParam, nextRoster, nextRoster->location, offsetTZMinutes)) {
                //不在红眼时段，则继续
                continue;
            }

            bool ignoreRedEye = false;
            bool afterMatched = false;//向后匹配
            auto& redEyeDefInDutyCycleParams = _ruleParams[0].GetRedEyeDefinitionInDutyCycleForHXParams();
            for (auto& redEyeDefInDutyCycleParam : redEyeDefInDutyCycleParams) {
                if (!redEyeDefInDutyCycleParam._isAfterFDP) {
                    continue;
                }
                afterMatched = true;
                if (find(redEyeDefInDutyCycleParam._excludeAssignments.begin(), redEyeDefInDutyCycleParam._excludeAssignments.end(), nextRoster->qualifier) != redEyeDefInDutyCycleParam._excludeAssignments.end()) {
                    //在排除的任务中
                    ignoreRedEye = true;
                    break;
                }
            }
            if (afterMatched && !ignoreRedEye) {
                nextRoster->setIsRedEye(true);
                nextRoster->setRedEyeStartMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclStartMinutes);
                nextRoster->setRedEyeEndMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclEndMinutes);
                recencyRedEyeActivity = nextRoster;
            }
        }
        else {
            Duty* nextDuty = (Duty*)activityPeriod->GetActivity();

            time_t gapStartLoc = recencyRedEyeActivity->getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60;
            if (typeid(*recencyRedEyeActivity) == typeid(ROSTER)) {
                gapStartLoc = ((ROSTER*)recencyRedEyeActivity)->getRestStartUtcAct() + (time_t)offsetTZMinutes * 60;
            }
            time_t gapEndLoc = nextDuty->getStartTimeUtcAct() + (time_t)offsetTZMinutes * 60;
            int gapDays = TimeUtils::DiffDay(gapStartLoc, gapEndLoc);
            if (gapDays > 1) {
                //二个Duty间隔超过1天，时间不满足红眼任务条件
                return;
            }

            if (nextDuty->getFDPInSecs() > 0 || nextDuty->getDPInSecs() <= 0) {
                //不是地面任务Duty 或者 Duty无DP 则不需要重新计算是否是红眼任务
                continue;
            }

            RedEyeDefinitionForHXParam* matchedRuleParam = nullptr;
            if (!isRedEyeDuty(matchedRuleParam, nextDuty, base, offsetTZMinutes)) {
                //不在红眼时段，则继续
                continue;
            }

            bool ignoreRedEye = false;
            bool afterMatched = false;//向后匹配
            auto& redEyeDefInDutyCycleParams = _ruleParams[0].GetRedEyeDefinitionInDutyCycleForHXParams();
            for (auto& redEyeDefInDutyCycleParam : redEyeDefInDutyCycleParams) {
                if (!redEyeDefInDutyCycleParam._isAfterFDP) {
                    continue;
                }
                afterMatched = true;
                if (find(redEyeDefInDutyCycleParam._excludeAssignments.begin(), redEyeDefInDutyCycleParam._excludeAssignments.end(), nextDuty->getAssignment()) != redEyeDefInDutyCycleParam._excludeAssignments.end()) {
                    //在排除的任务中
                    ignoreRedEye = true;
                    break;
                }
            }
            if (afterMatched && !ignoreRedEye) {
                nextDuty->setIsRedEye(true);
                nextDuty->setRedEyeStartMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclStartMinutes);
                nextDuty->setRedEyeEndMinutes(matchedRuleParam == nullptr ? -1 : matchedRuleParam->_woclEndMinutes);
                recencyRedEyeActivity = nextDuty;
            }
        }
    }
}