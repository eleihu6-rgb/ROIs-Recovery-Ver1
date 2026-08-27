#ifndef _ASSIGNMENTUTILS_H_
#define _ASSIGNMENTUTILS_H_

#include <string>
#include "CrewDB.h"

class AssignmentUtils {

public:
	/*
	* 判断是否是请休假
	* @param assignmentGroup： 任务组
	* @return true-是请休假，false-不是请休假
	*/
	static bool IsLeaveAssignment(const std::string& assignmentGroup);

	/*
	* 判断是否是飞行任务
	* @param assignment： 任务类型
	* @param dbData： 
	* @return true-是飞行任务，false-不是飞行任务
	*/
	static bool IsFlyAssignment(const std::string& assignment , const SharedPtr<CrewDataContext>& dbData);


	static bool IsAssignmentMrtOveride(const std::string& assign1, const string& assign2, const SharedPtr<CrewDataContext>& dbData);
	static bool IsAssignmentOverlappable(const std::string& assign1, const string& assign2, const SharedPtr<CrewDataContext>& dbData);

};
#endif //_ASSIGNMENTUTILS_H_