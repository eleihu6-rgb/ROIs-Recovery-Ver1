#include "AssignmentUtils.h"

#include "../constant/Constants.h"

bool AssignmentUtils::IsLeaveAssignment(const std::string& assignmentGroup) {
	if (assignmentGroup == DefaultAssignmentGroup::AL) {
		return true;
	}
	return false;
}

bool AssignmentUtils::IsFlyAssignment(const std::string& assignment, const SharedPtr<CrewDataContext>& dbData) {
	if (dbData->isAssignmentInGroup(assignment, DefaultAssignmentGroup::FLY) 
		|| dbData->isAssignmentInGroup(assignment, DefaultAssignmentGroup::MVO)) {
		return true;
	}
	return false;
}

bool AssignmentUtils::IsAssignmentMrtOveride(const std::string& assign1, const string& assign2, const SharedPtr<CrewDataContext>& dbData) {
	for (auto& mrtOveride : dbData->assignmentMrtOveride) {
		if (mrtOveride->assignmentGroupPrev != "*"
			&& !dbData->isAssignmentInGroup(assign1, mrtOveride->assignmentGroupPrev)) {
			continue;
		}

		if (mrtOveride->assignmentPrev != "*"
			&& mrtOveride->assignmentPrev.find(assign1) == mrtOveride->assignmentPrev.npos) {
			continue;
		}

		if (mrtOveride->assignmentGroupNext != "*"
			&& !dbData->isAssignmentInGroup(assign2, mrtOveride->assignmentGroupNext)) {
			continue;
		}

		if (mrtOveride->assignmentNext != "*"
			&& mrtOveride->assignmentNext.find(assign2) == mrtOveride->assignmentNext.npos) {
			continue;
		}

		return true;
	}
	return false;
}


bool AssignmentUtils::IsAssignmentOverlappable(const std::string& assign1, const string& assign2, const SharedPtr<CrewDataContext>& dbData) {
	for (auto& overlappable : dbData->assignmentOverlappableType) {
		
		if ((overlappable->assignmentGroupPrev == "*" || dbData->isAssignmentInGroup(assign1, overlappable->assignmentGroupPrev))
			&& (overlappable->assignmentPrev == "*" || overlappable->assignmentPrev == assign1)) {
			
			if ((overlappable->assignmentGroupNext == "*" || dbData->isAssignmentInGroup(assign2, overlappable->assignmentGroupNext))
				&& (overlappable->assignmentNext == "*" || overlappable->assignmentNext == assign2)) {
			
				return true;
			}
		}

	}
	return false;
}
