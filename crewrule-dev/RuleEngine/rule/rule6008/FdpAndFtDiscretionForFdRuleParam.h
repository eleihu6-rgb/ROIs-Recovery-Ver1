/**
 * @file FdpAndFtDiscretionForFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _FDPANDFTDISCRETIONFORFDRULEPARAM_H_
#define _FDPANDFTDISCRETIONFORFDRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class CheckFdpAndFtDiscretionForFdRule;
class CalculateFdpAndFtDiscretionForFdRule;

class FdpAndFtDiscretionForFdRuleParam : public RuleParam {
	friend class CheckFdpAndFtDiscretionForFdRule;
	friend class CalculateFdpAndFtDiscretionForFdRule;
private:
    explicit FdpAndFtDiscretionForFdRuleParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6008;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
		COMPOSITIONS = 0,
		ACC_STATE = 1,
		IS_ONLY_LAST_DUTY = 2,
		DUTY_TYPE = 3,
		FDP_MAX_EXTENSION = 4,
		FT_MAX_EXTENSION = 5,
		DP_MAX_EXTENSION = 6,
		SEVERITY = 7
    };

	//配比名称,支持“|”分隔表示多个值OR关系，支持通配符“*”表示所有
	std::vector<std::string> _compositions{};

	//适用状态,取值：A-适应状态，U-未知状态，支持通配符“*”表示所有
	std::string _acclimatizationState{};

	//是否仅最后Duty启用Discretion,取值：Y/N。*表示未设置
	//Y-仅对任务环最后一个DUTY启用Discretion，N和*为任务环的DUTY都启用discretion
	std::unique_ptr<bool> _isOnlyLastDuty{ nullptr };

	//D,I,R,支持“|”分隔标识多个值，支持通配符“*”表示所有
	std::string _dutyType{};
	std::vector<std::string> _dutyTypeVec{};

	//FDP最大扩展值,格式：HH:mm
	std::string _fdpMaxExtension{};
	int _fdpMaxExtensionMinutes{ 0 };
	//FT(飞时)最大扩展值,格式：HH:mm
	std::string _ftMaxExtension{};
	int _ftMaxExtensionMinutes{ 0 };
	//DP最大扩展值,格式：HH:mm
	std::string _dpMaxExtension{};
	int _dpMaxExtensionMinutes{ 0 };


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchComposition(const Duty& duty) const;

	bool MatchAcclimatizationState(const Duty& duty) const;

	bool MatchDytyType(const Duty& duty) const;

	bool MatchOnlyLastDuty(const Duty& currDuty, const vector<Duty*>& duties) const;

	//检查飞行执勤期FDP Extension是否满足
	bool CheckFDPExtension(const Duty& duty, const vector<Duty*>& duties) const;

	//检查飞时FT Extension是否满足
	bool CheckFTExtension(const Duty& duty, const vector<Duty*>& duties) const;

	//检查DP Extension是否满足
	bool CheckDPExtension(const Duty& duty, const vector<Duty*>& duties) const;
public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
		FDP_EXTENSION_WARN = 1, //FTP扩展后仍然不满足后告警
		FT_EXTENSION_WARN = 2, //FT扩展后仍然不满足后告警
		DP_EXTENSION_WARN = 3 //DP扩展后仍然不满足后告警
	};

	/*
	* 匹配是否满足参数
	* @param currDuty 当前duty
	* @param duties 当前Duty所属Pairing的Duty列表
	*/
	bool MatchParam(const Duty& currDuty, const vector<Duty*>& duties) const;

	//检查是否满足参数
	int CheckParam(const Duty& duty, const vector<Duty*>& duties) const;
};

#endif //_FDPANDFTDISCRETIONFORFDRULEPARAM_H_
