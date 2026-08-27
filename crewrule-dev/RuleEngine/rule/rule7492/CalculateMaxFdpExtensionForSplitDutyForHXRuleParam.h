/**
 * @file CalculateMaxFdpExtensionForSplitDutyForHXRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-03-30
**/

#ifndef _CALCULATEMAXFDPEXTENSIONFORSPLITDUTYFORHXRULEPARAM_H_
#define _CALCULATEMAXFDPEXTENSIONFORSPLITDUTYFORHXRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>
#include <vector>

class CalculateMaxFdpExtensionForSplitDutyForHXRule;

class CalculateMaxFdpExtensionForSplitDutyForHXRuleParam : public RuleParam {
	friend class CalculateMaxFdpExtensionForSplitDutyForHXRule;
private:
	explicit CalculateMaxFdpExtensionForSplitDutyForHXRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7492;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 5;

	enum class ParamLocation {
		COMPOSITIONS = 0,
		LT_REST_THREADHOLD = 1,
		LT_REST_RATIO = 2,
		PRE_SPLIT_MAX_FDP = 3,
		POST_SPLIT_MAX_FDP = 4
	};

	//Compositions - 机组配比，支持多选，竖线分隔，支持*号通配符
	std::string _compositionsStr{};
	std::vector<std::string> _compositions{};

	//LT Rest Threadhold - 休息时间阈值。格式：HH:mm
	//当航班间休息时间超过此阈值时，FDP可以延长
	std::string _ltRestThreadholdStr{};
	int _ltRestThreadholdMinutes{};

	//LT Rest Ratio - 休息时间比例。格式：小数
	//FDP延长值 = ltRestRatio * (休息时间分钟数)
	std::string _ltRestRatioStr{};
	double _ltRestRatio{};

	//Pre Split Max FDP - Split前实际FDP上限，格式：HH:mm
	std::string _preSplitMaxFdpStr{};
	int _preSplitMaxFdpMinutes{};

	//Post Split Max FDP - Split后实际FDP上限，格式：HH:mm
	std::string _postSplitMaxFdpStr{};
	int _postSplitMaxFdpMinutes{};


	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

private:

	bool MatchParam(const Duty* duty, const time_t checkStart, const time_t checkEnd) const;

	bool MatchCompositions(const Duty* duty) const;

	bool MatchPreSplitMaxFdp(int preSplitFdpMinutes) const;

	bool MatchPostSplitMaxFdp(int postSplitFdpMinutes) const;

};

#endif //_CALCULATEMAXFDPEXTENSIONFORSPLITDUTYFORHXRULEPARAM_H_
