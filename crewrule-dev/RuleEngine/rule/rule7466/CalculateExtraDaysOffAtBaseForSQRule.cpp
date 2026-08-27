/**
 * @file CalculateExtraDaysOffAtBaseForSQRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/

#include <unordered_map>

#include "../RuleSytem.h"
#include "CalculateExtraDaysOffAtBaseForSQRule.h"
#include "Log/Logger.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

namespace {
bool parseBoolYN(const std::string& value, bool defaultValue) {
	const std::string upper = strToUpper(trim(value));
	if (upper.empty()) {
		return defaultValue;
	}
	if (upper == "Y" || upper == "YES" || upper == "TRUE" || upper == "1") {
		return true;
	}
	if (upper == "N" || upper == "NO" || upper == "FALSE" || upper == "0") {
		return false;
	}
	return defaultValue;
}

std::vector<std::string> splitPipeUpper(const std::string& value) {
	std::vector<std::string> out;
	const std::string trimmed = trim(value);
	if (trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::IGNORED || trimmed == RuleParamConstant::IGNORED_2) {
		return out;
	}
	std::vector<std::string> parts;
	split(trimmed.c_str(), '|', parts);
	for (auto& p : parts) {
		const std::string token = strToUpper(trim(p));
		if (!token.empty()) {
			out.push_back(token);
		}
	}
	return out;
}

int getDutyDropoffMinutes(const Duty& duty) {
	int dropoff = duty.getActualDropoffMin();
	if (dropoff <= 0) {
		dropoff = duty.getMinDropoff();
	}
	return dropoff < 0 ? 0 : dropoff;
}

bool isDebriefBased(Exdo7466RestStartsAfter startsAfter) {
	return startsAfter != Exdo7466RestStartsAfter::Transport;
}

bool exactMidnightStartsNextDay(Exdo7466RestStartsAfter startsAfter) {
	return startsAfter == Exdo7466RestStartsAfter::DebriefNxdo;
}

time_t alignDoStartToMidnight(time_t restStartLoc, Exdo7466RestStartsAfter startsAfter) {
	if (restStartLoc <= 0) {
		return 0;
	}
	const time_t dayStart = TimeUtils::Truncate(restStartLoc, ChronoUnit::DAYS);
	if (restStartLoc == dayStart) {
		return exactMidnightStartsNextDay(startsAfter) ? TimeUtils::AddDay(dayStart, 1) : dayStart;
	}
	return TimeUtils::AddDay(dayStart, 1);
}

int getDebriefToDropoffMinutesLoc(const Duty& duty) {
	const auto debrief = duty.getLastDebrief();
	const auto dropoff = duty.getLastDropoff();
	if (debrief != nullptr && dropoff != nullptr) {
		const time_t debriefEndLoc = debrief->getEndTimeLocAct();
		const time_t dropoffEndLoc = dropoff->getEndTimeLocAct();
		if (debriefEndLoc > 0 && dropoffEndLoc > 0 && dropoffEndLoc >= debriefEndLoc) {
			return static_cast<int>((dropoffEndLoc - debriefEndLoc) / 60);
		}
	}
	return getDutyDropoffMinutes(duty);
}

time_t getRestStartLocAfterDuty(const Duty& duty, Exdo7466RestStartsAfter startsAfter) {
	const time_t endLoc = duty.getEndTimeLocAct();
	if (endLoc <= 0) {
		return 0;
	}
	if (isDebriefBased(startsAfter)) {
		auto debrief = duty.getLastDebrief();
		if (debrief != nullptr && debrief->getEndTimeLocAct() > 0) {
			return debrief->getEndTimeLocAct();
		}
		return endLoc;
	}
	auto dropoff = duty.getLastDropoff();
	if (dropoff != nullptr && dropoff->getEndTimeLocAct() > 0) {
		return dropoff->getEndTimeLocAct();
	}
	const int dropoffMin = getDutyDropoffMinutes(duty);
	return endLoc + static_cast<time_t>(dropoffMin) * 60;
}

time_t getDOStartUtcAfterDuty(const Duty& duty, Exdo7466RestStartsAfter startsAfter) {
	time_t endUtc = duty.getEndTimeUtcAct();
	if (endUtc <= 0) {
		endUtc = duty.getEndTimeUtcSch();
	}
	if (endUtc <= 0) {
		return 0;
	}
	if (isDebriefBased(startsAfter)) {
		auto debrief = duty.getLastDebrief();
		if (debrief != nullptr && debrief->getEndTimeUtcAct() > 0) {
			return debrief->getEndTimeUtcAct();
		}
		return endUtc;
	}
	auto dropoff = duty.getLastDropoff();
	if (dropoff != nullptr && dropoff->getEndTimeUtcAct() > 0) {
		return dropoff->getEndTimeUtcAct();
	}
	const int dropoffMin = getDutyDropoffMinutes(duty);
	return endUtc + static_cast<time_t>(dropoffMin) * 60;
}
}  // namespace

void CalculateExtraDaysOffAtBaseForSQRule::CalculateDuty(Pairing* pairing) {
	if (_ruleInstances.empty() || pairing == nullptr) {
		return;
	}

	for (const auto& instance : _ruleInstances) {
		for (const auto& ruleParam : instance.params) {
			if (!CalculateDuty(pairing, ruleParam, instance.control)) {
				return;
			}
		}
	}
}

void CalculateExtraDaysOffAtBaseForSQRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (_ruleInstances.empty()) {
		return;
	}
	for (auto& roster : rosters) {
		if (roster == nullptr || roster->pairing == nullptr) {
			continue;
		}
		CalculateDuty(roster->pairing);
    }
}

bool CalculateExtraDaysOffAtBaseForSQRule::CalculateDuty(Pairing* pairing,
                                                        const ExtraDaysOffAtBaseForSQRuleParam& ruleParam,
                                                        const Exdo7466ControlParam& control) {
	bool next = true;
	const CrewDataContext* dbData = GetDataContext().get();
	if (ruleParam.MatchParam(pairing, control, dbData)) {
		auto lastDuty = pairing->getLastDuty();
		if (lastDuty == nullptr) {
			return true;
		}
		time_t restStartTimeLoc = getRestStartLocAfterDuty(*lastDuty, control.doStartsAfter);
		if (restStartTimeLoc <= 0) {
			int offsetTZInSecs = 0;
			if (pairing->getStartTimeLocAct() > 0 && pairing->getStartTimeUtcAct() > 0) {
				offsetTZInSecs = static_cast<int>(pairing->getStartTimeLocAct() - pairing->getStartTimeUtcAct());
			}
			const time_t restStartUtc = getDOStartUtcAfterDuty(*lastDuty, control.doStartsAfter);
			if (restStartUtc > 0) {
				restStartTimeLoc = restStartUtc + static_cast<time_t>(offsetTZInSecs);
			}
		}
		if (restStartTimeLoc <= 0) {
			return true;
		}
		const int debriefToDropoffMinutes =
			isDebriefBased(control.doStartsAfter) ? getDebriefToDropoffMinutesLoc(*lastDuty) : 0;

		// EXDO is treated as additional ATDO days: total days off = existing ATDO + EXDO.
		const int totalDaysOff = std::max(0, lastDuty->getMinATDO()) + std::max(0, ruleParam.GetExtraDaysOff());
		const time_t alignLoc = alignDoStartToMidnight(restStartTimeLoc, control.doStartsAfter);
		const time_t restEndTimeLoc = TimeUtils::AddDay(alignLoc, totalDaysOff);

        // Min Rest鎵╁睍ExtraDaysOff澶╂暟
		int minRest = static_cast<int>((restEndTimeLoc - restStartTimeLoc) / 60);
		if (debriefToDropoffMinutes > 0) {
			minRest = std::max(0, minRest - debriefToDropoffMinutes);
		}
		lastDuty->setMinRestAtBase(minRest);
		lastDuty->setMinRest(minRest);
		lastDuty->setMinEXDO(ruleParam.GetExtraDaysOff());
		lastDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, 
									minRest, 
									ruleParam.GetId(), 
									ruleParam.GetRuleParamId(),
									ruleParam.GetOverrideAbility(), 
									ruleParam.GetClassType(), 
									ruleParam.GetDescription(), 
									ruleParam.GetReference());

		next = false;
	}
	return next;
}

namespace {
bool ParseControlRow(const DBRule& dbRule, Exdo7466ControlParam& control) {
	auto& parameters = const_cast<DBRule&>(dbRule).params;
	for (auto it = parameters.begin(); it != parameters.end(); ++it) {
		const std::string headerUpper = strToUpper(trim(it->first));
		const std::string valueUpper = strToUpper(trim(it->second));
		if (headerUpper == "SBY REDUCES REST AND LN" || headerUpper == "SBY REDUCES REST AND LOCAL NIGHT") {
			control.standbyReducesRestAndLocalNight = parseBoolYN(it->second, control.standbyReducesRestAndLocalNight);
		} else if (headerUpper == "REST STARTS AFTER") {
			if (valueUpper == "DEBRIEF_NXDO" || valueUpper == "DEBRIEF_NEXT_DO") {
				control.restStartsAfter = Exdo7466RestStartsAfter::DebriefNxdo;
			} else if (valueUpper == "DEBRIEF" || valueUpper == "DEBRIEFING") {
				control.restStartsAfter = Exdo7466RestStartsAfter::Debrief;
			} else if (valueUpper == "TRANSPORT" || valueUpper == "DROPOFF" || valueUpper == "DROP OFF" || valueUpper == "DROP-OFF") {
				control.restStartsAfter = Exdo7466RestStartsAfter::Transport;
			}
		} else if (headerUpper == "STANDBY ASSIGNMENTS") {
			auto list = splitPipeUpper(it->second);
			if (!list.empty()) {
				control.standbyAssignmentsUpper = std::move(list);
			}
		} else if (headerUpper == "DO STARTS AFTER") {
			if (valueUpper == "DEBRIEF_NXDO" || valueUpper == "DEBRIEF_NEXT_DO") {
				control.doStartsAfter = Exdo7466RestStartsAfter::DebriefNxdo;
			} else if (valueUpper == "DEBRIEF" || valueUpper == "DEBRIEFING") {
				control.doStartsAfter = Exdo7466RestStartsAfter::Debrief;
			} else if (valueUpper == "TRANSPORT" || valueUpper == "DROPOFF" || valueUpper == "DROP OFF" || valueUpper == "DROP-OFF") {
				control.doStartsAfter = Exdo7466RestStartsAfter::Transport;
			}
		} else {
			Logger::getRuleLogger()->warn("Rule 7466 control parameter ignored, header: {}", it->first);
		}
	}
	return true;
}
}  // namespace

void CalculateExtraDaysOffAtBaseForSQRule::ParseParam(const InputType& input) {
	_ruleInstances.clear();
	std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
	instanceIndexByRuleId.reserve(input.dbRules.size());

	auto getOrCreateInstance = [&](long long ruleId) -> RuleInstance& {
		const auto it = instanceIndexByRuleId.find(ruleId);
		if (it != instanceIndexByRuleId.end()) {
			return _ruleInstances[it->second];
		}
		const std::size_t idx = _ruleInstances.size();
		_ruleInstances.push_back(RuleInstance{});
		_ruleInstances.back().ruleId = ruleId;
		instanceIndexByRuleId.emplace(ruleId, idx);
		return _ruleInstances.back();
	};

	if (!input.dbRules.empty()) {
		for (const auto& dbRule : input.dbRules) {
			if (dbRule.tableNum == 2) {
				auto& instance = getOrCreateInstance(dbRule.idRule);
				ParseControlRow(dbRule, instance.control);
				continue;
			}
			if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
				continue;
			}
			auto& instance = getOrCreateInstance(dbRule.idRule);
			instance.params.emplace_back(ExtraDaysOffAtBaseForSQRuleParam(this));
			auto& newParam = instance.params.back();
			newParam.ParseParam(dbRule);
		}
		return;
	}

	if (!input.ruleParamString.empty()) {
		auto& instance = getOrCreateInstance(RuleFuncId);
		for (const auto& singleRuleParamString : input.ruleParamString) {
			instance.params.emplace_back(ExtraDaysOffAtBaseForSQRuleParam(this));
			auto& newParam = instance.params.back();
			newParam.ParseParam(singleRuleParamString);
		}
	}
}
