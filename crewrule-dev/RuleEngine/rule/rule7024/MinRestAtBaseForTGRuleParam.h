/**
 * @file MinRestAtBaseForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/

#ifndef _MINRESTATBASEFORTGRULEPARAM_H_
#define _MINRESTATBASEFORTGRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CheckMinRestAtBaseForTGRule;
class CalculateAccStartAtBaseForRTRule;


class MinRestAtBaseForTGRuleParam : public RuleParam {
	friend class CheckMinRestAtBaseForTGRule;
	friend class CalculateMinRestAtBaseForTGRule;
	friend class CalculateAccStartAtBaseForRTRule;
private:
    explicit MinRestAtBaseForTGRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7024;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 10;

    enum class ParamLocation {
		BASES = 1,
		RANKS = 2,
		FLEETS = 3,
		TEAMS = 4,
		PAIRING_ASSIGNMENTS = 5,
		TZ_DIFF = 6,
		PAIRING_DURATION = 7,
		IS_DIRECTION_TRANSITION = 8,
		MIN_LOCAL_NIGHTS = 9,
		SEVERITY = 10
    };

	//人员所属基地,使用“|”分隔，表示多个值
	std::vector<std::string> _bases{};
	//人员级别,使用“|”分隔，表示多个值
	std::vector<std::string> _ranks{};
	//人员机型,使用“|”分隔，表示多个值
	std::vector<std::string> _fleets{};
	//团队,多个值使用“|”分隔并支持*通配
	std::vector<std::string> _teams{};

	//Pairing 任务类型,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _pairingAssignments{};

	//时差范围（分钟数范围）,格式：HH:mm-HH:mm，取值范围：[HH:mm,HH:mm)，支持配置*忽略该参数。
	//例如：00:00 - 02 : 00，表示时差0小时到2小时
	std::string _timezoneDiff{};
	int _timezoneDiffMinutesLower{ 0 };
	int _timezoneDiffMinutesUpper{ 0 };

	//Pairing的时长（分钟数）。格式：HH:mm-HH:mm，支持配置*忽略该参数。取值范围：[HH:mm,HH:mm)。
	std::string _pairingDuration{};
	int _pairingDurationMinutesLower{ 0 };
	int _pairingDurationMinutesUpper{ 0 };

	//是否飞行方向轮换Eastward-Westward or Westward-Eastward transition。取值：Y/N，支持配置*忽略该参数。
	std::shared_ptr<bool> _isDirectionTransition{ nullptr };

	//最小本地夜晚天数,
	int _minLocalNightNum{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断机组人员是否满足资质
	bool MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const;

	//判断Pairing是否满足任务类型
	bool MatchPairingAssignments(const Pairing* pairing) const;

	//判断Pairing是否满足时长
	bool MatchPairingDuration(const Pairing* pairing) const;

	//判断Pairing HomeBase与Layover地点时区差是否满足要求
	bool MatchLayoverTzDiff(const Pairing* pairing, const int baseOffsetTZMinutes) const;

	//判断Pairing是否满足飞行方向轮换Eastward-Westward or Westward-Eastward transition
	bool MatchDirectionTransition(const Pairing* currPairing, const Pairing* nextPairing, const int baseOffsetTZMinutes) const;

	//判断Pairing是否是飞行方向轮换Eastward-Westward or Westward-Eastward transition
	bool IsDirectionTransition(const Pairing* currPairing, const Pairing* nextPairing, const int baseOffsetTZMinutes) const;

public:

	bool MatchParam(const Pairing* currPairing, const Pairing* nextPairing, const int offsetTZMinutes) const;

};

#endif //_MINRESTATBASEFORTGRULEPARAM_H_
