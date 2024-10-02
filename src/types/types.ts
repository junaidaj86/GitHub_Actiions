interface UpdateYamlRequest {
  filePath: string;
  updateData: Record<string, any>; // Dynamic object with key-value pairs
}

interface AddSectionRequest {
  filePath: string;
  newSection: Record<string, any>; // The new section to add
  branchName: string;
}
