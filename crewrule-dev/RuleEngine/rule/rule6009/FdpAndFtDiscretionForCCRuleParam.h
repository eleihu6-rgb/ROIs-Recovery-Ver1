/**
 * @file FdpAndFtDiscretionForCCRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _FDPANDFTDISCRETIONFORCCRULEPARAM_H_
#define _FDPANDFTDISCRETIONFORCCRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckFdpAndFtDiscretionForCCRule;
class CalculateFdpAndFtDiscretionForCCRule;

class FdpAndFtDiscretionForCCRuleParam : public RuleParam {
	friend class CheckFdpAndFtDiscretionForCCRule;
	friend class CalculateFdpAndFtDiscretionForCCRule;
private:
    explicit FdpAndFtDiscretionForCCRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6009;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		MAXIMUM_DUTY_PERIOD = 0,
		FLOWN_SEGMENT_RANGES = 1,
		MIN_ODP_BEFORE_DUTY = 2,
		FDP_MAX_EXTENSION = 3,
		FT_MAX_EXTENSION = 4,
		SEVERITY = 5
    };

	//最大执勤期（DP）,格式：HH:mm
	std::string _maxDP{};
	int _maxDPMinutes{ 0 };
	//已执行航段范围,格式：最小值-最大值
	std::string _flownSegmentRanges{};
	int _flownSegmentLower{ 0 };
	int _flownSegmentUpper{ 0 };
	//Duty之前的ODP（Layover或者上个）时长,格式：HH:mm
	std::string _minODPBeforeDuty{};
	int _minODPBeforeDutyMinutes{ 0 };
	//FDP最大扩展值,格式：HH:mm
	std::string _fdpMaxExtension{};
	int _fdpMaxExtensionMinutes{ 0 };
	//FT(飞时)最大扩展值,格式：HH:mm
	std::string _ftMaxExtension{};
	int _ftMaxExtensionMinutes{ 0 };

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配MaxDP
	bool MatchMaxDP(const Duty& duty) const;

	//匹配FlownSegments
	bool MatchFlownSegments(const Duty& duty) const;

	//匹配odpBeforeDuty
	bool MatchOdpBeforeDuty(const Duty* prevDuty, const Duty* currDuty) const;

	//检查飞行执勤期FDP Extension是否满足
	bool CheckFDPExtension(const Duty& duty) const;

	//检查飞时FT Extension是否满足
	bool CheckFTExtension(const Duty& duty) const;
public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		FDP_EXTENSION_WARN = 1, //FTP扩展后仍然不满足后告警
		FT_EXTENSION_WARN = 2 //FT扩展后仍然不满足后告警
	};

	//匹配是否满足参数
	bool MatchParam(const Duty* duty, const Duty* prevDuty) const;

	//检查是否满足参数
	int CheckParam(const Duty& duty) const;
};

#endif //_FDPANDFTDISCRETIONFORCCRULEPARAM_H_
